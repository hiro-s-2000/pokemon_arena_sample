#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CORE_DIR = path.resolve(__dirname, "..");
const ARENA_DIR = path.join(CORE_DIR, "pokemon-arena-2d");
const SPRITE_DIR = path.join(CORE_DIR, "pokeSprite");
const MANIFEST_JSON = path.join(SPRITE_DIR, "manifest.json");
const MANIFEST_JS = path.join(SPRITE_DIR, "manifest.js");
const DATA_JS = path.join(ARENA_DIR, "data.js");
const POKE_DATA_JS = path.join(CORE_DIR, "pokeData", "pokeData.js");
const INDEX_HTML = path.join(ARENA_DIR, "index.html");
const SPRITE_ANIMATOR_JS = path.join(ARENA_DIR, "sprite_animator.js");
const EFFECTS_JS = path.join(ARENA_DIR, "effects.js");

const ASSET_FILES = {
  frontPng: "front.png",
  frontGif: "front.gif",
  frontReverseGif: "front-reverse.gif",
  backPng: "back.png",
  backGif: "back.gif",
  backReverseGif: "back-reverse.gif"
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function webPathToFile(webPath) {
  return path.resolve(ARENA_DIR, webPath);
}

function imageSignatureIsValid(filePath) {
  const buffer = Buffer.alloc(8);
  const descriptor = fs.openSync(filePath, "r");
  const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
  fs.closeSync(descriptor);
  if (bytesRead < 6) return false;
  if (filePath.endsWith(".gif")) {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (filePath.endsWith(".png")) {
    return buffer.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return false;
}

function allForms(manifest) {
  const result = [];
  for (const pokemon of Object.values(manifest.pokemon)) {
    result.push({ pokemon, form: pokemon.forms.normal });
    for (const kind of ["mega", "gigantamax", "regional"]) {
      for (const form of Object.values(pokemon.forms[kind])) result.push({ pokemon, form });
    }
  }
  return result;
}

function makeBrowserContext() {
  const context = { console };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function checkManifestAndFiles(manifest) {
  assert(manifest.schemaVersion === 1, `Unexpected schema version: ${manifest.schemaVersion}`);
  assert(manifest.counts.pokemon === 1025, `Pokemon count: ${manifest.counts.pokemon}`);
  assert(manifest.counts.forms.normal === 1025, `Normal count: ${manifest.counts.forms.normal}`);
  assert(manifest.counts.forms.mega === 99, `Mega count: ${manifest.counts.forms.mega}`);
  assert(manifest.counts.forms.gigantamax === 34, `Gigantamax count: ${manifest.counts.forms.gigantamax}`);
  assert(manifest.counts.forms.regional === 58, `Regional count: ${manifest.counts.forms.regional}`);

  const paths = [];
  const forms = allForms(manifest);
  assert(forms.length === 1216, `Form count: ${forms.length}`);

  for (const { pokemon, form } of forms) {
    const expectedLeaf =
      form.kind === "normal"
        ? `../pokeSprite/gen${pokemon.generation}/${pokemon.folder}/normal/`
        : `../pokeSprite/gen${pokemon.generation}/${pokemon.folder}/${form.kind}/${form.formSlug}/`;
    assert(Object.keys(form.images).length === 6, `Asset key count: ${pokemon.slug}/${form.formSlug}`);
    for (const [key, fileName] of Object.entries(ASSET_FILES)) {
      const webPath = form.images[key];
      assert(webPath === `${expectedLeaf}${fileName}`, `Unexpected canonical path: ${webPath}`);
      const filePath = webPathToFile(webPath);
      assert(fs.existsSync(filePath), `Missing image: ${webPath}`);
      assert(fs.statSync(filePath).size > 0, `Empty image: ${webPath}`);
      assert(imageSignatureIsValid(filePath), `Invalid image signature: ${webPath}`);
      paths.push(webPath);
    }
  }

  assert(paths.length === 7296, `Image count: ${paths.length}`);
  assert(new Set(paths).size === paths.length, "Canonical image paths are not unique");
  for (const itemPath of Object.values(manifest.items)) {
    const filePath = webPathToFile(itemPath);
    assert(fs.existsSync(filePath), `Missing item: ${itemPath}`);
    assert(imageSignatureIsValid(filePath), `Invalid item signature: ${itemPath}`);
  }
  return new Set(paths);
}

function checkRuntimeManifest(manifest) {
  const context = makeBrowserContext();
  vm.runInContext(fs.readFileSync(MANIFEST_JS, "utf8"), context, { filename: MANIFEST_JS });
  vm.runInContext(
    `${fs.readFileSync(SPRITE_ANIMATOR_JS, "utf8")}\nthis.__GET_REVERSE_GIF_PATH__ = getReverseGifPath;`,
    context,
    { filename: SPRITE_ANIMATOR_JS }
  );
  vm.runInContext(fs.readFileSync(EFFECTS_JS, "utf8"), context, { filename: EFFECTS_JS });
  const runtime = context.POKE_SPRITE_MANIFEST;
  assert(runtime, "manifest.js did not expose POKE_SPRITE_MANIFEST");
  assert(runtime.counts.pokemonImages === 7296, "Runtime manifest image count is incorrect");

  let reverseMappings = 0;
  for (const { form } of allForms(manifest)) {
    assert(
      runtime.reverseFor(form.images.frontGif) === form.images.frontReverseGif,
      `Front reverse lookup failed: ${form.formSlug}`
    );
    assert(
      runtime.reverseFor(form.images.backGif) === form.images.backReverseGif,
      `Back reverse lookup failed: ${form.formSlug}`
    );
    assert(
      context.__GET_REVERSE_GIF_PATH__(form.images.frontGif) === form.images.frontReverseGif,
      `Animator front reverse lookup failed: ${form.formSlug}`
    );
    assert(
      context.__GET_REVERSE_GIF_PATH__(form.images.backGif) === form.images.backReverseGif,
      `Animator back reverse lookup failed: ${form.formSlug}`
    );
    reverseMappings += 2;
  }
  assert(reverseMappings === 2432, `Reverse mapping count: ${reverseMappings}`);
  return context;
}

function checkArenaData(manifest, canonicalPaths, context) {
  const source = fs.readFileSync(DATA_JS, "utf8");
  vm.runInContext(
    `${source}\nthis.__POKEMON_DATA__ = POKEMON_DATA; this.__CROWD_SPRITES__ = CROWD_SPRITES;`,
    context,
    { filename: DATA_JS }
  );
  const data = context.__POKEMON_DATA__;
  assert(Object.keys(data).length === 1025, `POKEMON_DATA count: ${Object.keys(data).length}`);
  assert(context.__CROWD_SPRITES__.length === 1025, "CROWD_SPRITES count is incorrect");

  const categoryFields = [
    ["megas", "mega"],
    ["gmaxs", "gigantamax"],
    ["regionals", "regional"]
  ];
  for (const [id, pokemon] of Object.entries(data)) {
    const entry = manifest.pokemon[id];
    assert(entry, `POKEMON_DATA entry is absent from manifest: ${id}`);
    assert(pokemon.sprite === entry.forms.normal.images.frontGif, `Normal front mismatch: ${id}`);
    assert(pokemon.backSprite === entry.forms.normal.images.backGif, `Normal back mismatch: ${id}`);
    for (const [field, kind] of categoryFields) {
      const runtimeForms = pokemon[field] || [];
      const manifestForms = entry.forms[kind];
      assert(runtimeForms.length === Object.keys(manifestForms).length, `${field} count mismatch: ${id}`);
      for (const form of runtimeForms) {
        const manifestForm = manifestForms[form.formSlug];
        assert(manifestForm, `Missing manifest form: ${form.formSlug}`);
        assert(form.front === manifestForm.images.frontGif, `Form front mismatch: ${form.formSlug}`);
        assert(form.back === manifestForm.images.backGif, `Form back mismatch: ${form.formSlug}`);
      }
    }
  }
  for (const spritePath of context.__CROWD_SPRITES__) {
    assert(canonicalPaths.has(spritePath), `Unregistered crowd sprite: ${spritePath}`);
  }
}

function checkPokeData(canonicalPaths) {
  const context = makeBrowserContext();
  vm.runInContext(fs.readFileSync(POKE_DATA_JS, "utf8"), context, { filename: POKE_DATA_JS });
  const entries = Object.values(context.POKE_DATA_BY_STEM || {});
  assert(entries.length === 1216, `POKE_DATA_BY_STEM count: ${entries.length}`);
  for (const entry of entries) {
    assert(canonicalPaths.has(entry.sprite), `Unregistered PokéData front: ${entry.id}`);
    assert(canonicalPaths.has(entry.backSprite), `Unregistered PokéData back: ${entry.id}`);
  }
}

function checkHtml(canonicalPaths) {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const manifestIndex = html.indexOf("../pokeSprite/manifest.js");
  const dataIndex = html.indexOf('src="data.js');
  const animatorIndex = html.indexOf('src="sprite_animator.js');
  const gameIndex = html.indexOf('src="game.js');
  assert(manifestIndex >= 0, "index.html does not load manifest.js");
  assert(manifestIndex < dataIndex, "manifest.js must load before data.js");
  assert(dataIndex < animatorIndex && animatorIndex < gameIndex, "Arena script order is invalid");
  for (const id of ["p1-portrait", "p2-portrait"]) {
    const pattern = new RegExp(`id="${id}" src="([^"]+)"`);
    const match = html.match(pattern);
    assert(match && canonicalPaths.has(match[1]), `Invalid initial portrait path: ${id}`);
  }
}

try {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_JSON, "utf8"));
  const canonicalPaths = checkManifestAndFiles(manifest);
  const runtimeContext = checkRuntimeManifest(manifest);
  checkArenaData(manifest, canonicalPaths, runtimeContext);
  checkPokeData(canonicalPaths);
  checkHtml(canonicalPaths);
  console.log(
    "Sprite verification passed: 1,025 Pokemon, 1,216 forms, 7,296 Pokemon images, " +
      "2 item images, and 2,432 reverse mappings."
  );
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
