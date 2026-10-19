#!/usr/bin/env node

/**
 * Two-phase sprite migration for Pokemon Arena 2D.
 *
 * Commands:
 *   node gameImpCore/tools/migrate-sprites.js prepare
 *   node gameImpCore/tools/migrate-sprites.js rewrite
 *   node gameImpCore/tools/migrate-sprites.js verify-copy
 *   node gameImpCore/tools/migrate-sprites.js prune
 *   node gameImpCore/tools/migrate-sprites.js verify
 *
 * `prepare` copies the images that the game currently uses into the canonical
 * generation/Pokemon/form layout. It never overwrites a different target.
 * `prune` is intentionally separate and refuses to run until all references
 * use the canonical paths and every copied asset has been verified.
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CORE_DIR = path.resolve(__dirname, "..");
const ARENA_DIR = path.join(CORE_DIR, "pokemon-arena-2d");
const DATA_JS = path.join(ARENA_DIR, "data.js");
const POKE_DATA_DIR = path.join(CORE_DIR, "pokeData");
const SPRITE_DIR = path.join(CORE_DIR, "pokeSprite");
const MANIFEST_JSON = path.join(SPRITE_DIR, "manifest.json");
const MANIFEST_JS = path.join(SPRITE_DIR, "manifest.js");

const LEGACY_ROOT_DIRS = ["back", "reverse", "mega", "gigantamax", "regional"];
const LEGACY_GENERATION_DIRS = ["back", "reverse", "mega", "gigantamax", "regional"];
const FORM_KINDS = ["normal", "mega", "gigantamax", "regional"];

function fail(message) {
  throw new Error(message);
}

function posix(value) {
  return value.split(path.sep).join("/");
}

function webPathToFile(webPath) {
  if (typeof webPath !== "string" || !webPath.startsWith("../pokeSprite/")) {
    fail(`Unexpected sprite path: ${String(webPath)}`);
  }
  return path.resolve(ARENA_DIR, webPath);
}

function fileToWebPath(filePath) {
  return posix(path.relative(ARENA_DIR, filePath));
}

function replaceExtension(webPath, extension) {
  return webPath.replace(/\.[^.\/]+$/, extension);
}

function legacyReversePath(webPath) {
  if (!webPath.endsWith(".gif")) fail(`Expected GIF path: ${webPath}`);
  const slash = webPath.lastIndexOf("/");
  const directory = webPath.slice(0, slash);
  const file = webPath.slice(slash + 1);
  if (file.endsWith("_back.gif")) {
    return `${directory}/reverse/${file.slice(0, -9)}_back_reverse.gif`;
  }
  return `${directory}/reverse/${file.slice(0, -4)}_reverse.gif`;
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function loadLegacyPokemonData() {
  const source = fs.readFileSync(DATA_JS, "utf8");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${source}\nthis.__MIGRATION_POKEMON_DATA__ = POKEMON_DATA;`,
    context,
    { filename: DATA_JS }
  );
  return context.__MIGRATION_POKEMON_DATA__;
}

function sourceForms(pokemon) {
  const forms = [
    {
      kind: "normal",
      formSlug: pokemon.id,
      front: pokemon.sprite,
      back: pokemon.backSprite
    }
  ];

  for (const form of pokemon.megas || []) {
    forms.push({ kind: "mega", formSlug: form.formSlug, front: form.front, back: form.back });
  }
  for (const form of pokemon.gmaxs || []) {
    forms.push({
      kind: "gigantamax",
      formSlug: form.formSlug,
      front: form.front,
      back: form.back
    });
  }
  for (const form of pokemon.regionals || []) {
    forms.push({
      kind: "regional",
      formSlug: form.formSlug,
      front: form.front,
      back: form.back
    });
  }

  return forms;
}

function assertSafeSegment(value, label) {
  if (typeof value !== "string" || !/^[a-z0-9-]+$/.test(value)) {
    fail(`Unsafe ${label}: ${String(value)}`);
  }
}

function addMapping(mapping, legacyPath, canonicalPath) {
  const previous = mapping[legacyPath];
  if (previous && previous !== canonicalPath) {
    fail(`Legacy path maps to multiple targets: ${legacyPath}`);
  }
  mapping[legacyPath] = canonicalPath;
}

function buildManifest() {
  const pokemonData = loadLegacyPokemonData();
  const manifest = {
    schemaVersion: 1,
    root: "../pokeSprite",
    layout: "gen{generation}/{dex}_{pokemon}/{kind}/{formSlug?}/{asset}",
    counts: {
      pokemon: 0,
      forms: { normal: 0, mega: 0, gigantamax: 0, regional: 0 },
      pokemonImages: 0,
      itemImages: 2
    },
    items: {
      pokeBallPng: "../pokeSprite/items/poke-ball.png",
      pokeBallGif: "../pokeSprite/items/poke-ball.gif"
    },
    pokemon: {},
    legacyToCanonical: {}
  };

  const targetOwners = new Map();

  for (const pokemon of Object.values(pokemonData)) {
    const normalFrontName = path.basename(pokemon.sprite, ".gif");
    const expectedDexPrefix = `${String(pokemon.dex).padStart(4, "0")}_`;
    if (!normalFrontName.startsWith(expectedDexPrefix)) {
      fail(`Dex/folder mismatch for ${pokemon.id}: ${normalFrontName}`);
    }
    assertSafeSegment(pokemon.id, "Pokemon id");

    const entry = {
      dex: pokemon.dex,
      generation: pokemon.gen,
      slug: pokemon.id,
      folder: normalFrontName,
      forms: { normal: null, mega: {}, gigantamax: {}, regional: {} }
    };

    for (const form of sourceForms(pokemon)) {
      if (!FORM_KINDS.includes(form.kind)) fail(`Unknown form kind: ${form.kind}`);
      assertSafeSegment(form.formSlug, "form slug");

      const relativeLeaf =
        form.kind === "normal"
          ? path.join(`gen${pokemon.gen}`, normalFrontName, "normal")
          : path.join(`gen${pokemon.gen}`, normalFrontName, form.kind, form.formSlug);
      const targetLeaf = path.join(SPRITE_DIR, relativeLeaf);

      const legacy = {
        frontPng: replaceExtension(form.front, ".png"),
        frontGif: form.front,
        frontReverseGif: legacyReversePath(form.front),
        backPng: replaceExtension(form.back, ".png"),
        backGif: form.back,
        backReverseGif: legacyReversePath(form.back)
      };
      const images = {
        frontPng: fileToWebPath(path.join(targetLeaf, "front.png")),
        frontGif: fileToWebPath(path.join(targetLeaf, "front.gif")),
        frontReverseGif: fileToWebPath(path.join(targetLeaf, "front-reverse.gif")),
        backPng: fileToWebPath(path.join(targetLeaf, "back.png")),
        backGif: fileToWebPath(path.join(targetLeaf, "back.gif")),
        backReverseGif: fileToWebPath(path.join(targetLeaf, "back-reverse.gif"))
      };

      for (const key of Object.keys(images)) {
        const owner = targetOwners.get(images[key]);
        const currentOwner = `${pokemon.id}/${form.kind}/${form.formSlug}/${key}`;
        if (owner) fail(`Canonical path collision: ${images[key]} (${owner}, ${currentOwner})`);
        targetOwners.set(images[key], currentOwner);
        addMapping(manifest.legacyToCanonical, legacy[key], images[key]);
      }

      const formEntry = { kind: form.kind, formSlug: form.formSlug, images, legacy };
      if (form.kind === "normal") entry.forms.normal = formEntry;
      else entry.forms[form.kind][form.formSlug] = formEntry;
      manifest.counts.forms[form.kind] += 1;
      manifest.counts.pokemonImages += Object.keys(images).length;
    }

    if (!entry.forms.normal) fail(`Missing normal form: ${pokemon.id}`);
    manifest.pokemon[pokemon.id] = entry;
    manifest.counts.pokemon += 1;
  }

  return manifest;
}

function runtimeManifest(manifest) {
  const copy = JSON.parse(JSON.stringify(manifest));
  delete copy.legacyToCanonical;
  for (const pokemon of Object.values(copy.pokemon)) {
    const groups = [
      [pokemon.forms.normal],
      Object.values(pokemon.forms.mega),
      Object.values(pokemon.forms.gigantamax),
      Object.values(pokemon.forms.regional)
    ];
    for (const group of groups) {
      for (const form of group) delete form.legacy;
    }
  }
  return copy;
}

function renderRuntimeManifest(manifest) {
  const data = JSON.stringify(runtimeManifest(manifest), null, 2);
  return `// Generated by ../tools/migrate-sprites.js. Do not edit by hand.\n` +
    `(function exposePokemonSpriteManifest(global) {\n` +
    `  "use strict";\n` +
    `  const manifest = ${data};\n` +
    `  const reverseByPath = Object.create(null);\n` +
    `  function indexForm(form) {\n` +
    `    if (!form) return;\n` +
    `    reverseByPath[form.images.frontGif] = form.images.frontReverseGif;\n` +
    `    reverseByPath[form.images.backGif] = form.images.backReverseGif;\n` +
    `  }\n` +
    `  Object.values(manifest.pokemon).forEach((pokemon) => {\n` +
    `    indexForm(pokemon.forms.normal);\n` +
    `    ["mega", "gigantamax", "regional"].forEach((kind) => {\n` +
    `      Object.values(pokemon.forms[kind]).forEach(indexForm);\n` +
    `    });\n` +
    `  });\n` +
    `  manifest.reverseFor = function reverseFor(sourcePath) {\n` +
    `    return reverseByPath[sourcePath] || null;\n` +
    `  };\n` +
    `  manifest.form = function form(pokemonId, kind, formSlug) {\n` +
    `    const pokemon = manifest.pokemon[pokemonId];\n` +
    `    if (!pokemon) return null;\n` +
    `    if (!kind || kind === "normal") return pokemon.forms.normal;\n` +
    `    const forms = pokemon.forms[kind];\n` +
    `    if (!forms) return null;\n` +
    `    if (formSlug) return forms[formSlug] || null;\n` +
    `    return Object.values(forms)[0] || null;\n` +
    `  };\n` +
    `  global.POKE_SPRITE_MANIFEST = manifest;\n` +
    `})(globalThis);\n`;
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_JSON)) fail(`Manifest not found: ${MANIFEST_JSON}`);
  return JSON.parse(fs.readFileSync(MANIFEST_JSON, "utf8"));
}

function formsInManifest(manifest) {
  const forms = [];
  for (const pokemon of Object.values(manifest.pokemon)) {
    forms.push(pokemon.forms.normal);
    for (const kind of ["mega", "gigantamax", "regional"]) {
      forms.push(...Object.values(pokemon.forms[kind]));
    }
  }
  return forms;
}

function canonicalImagePaths(manifest) {
  return formsInManifest(manifest).flatMap((form) => Object.values(form.images));
}

function validateManifestCounts(manifest) {
  const expected = {
    pokemon: 1025,
    normal: 1025,
    mega: 99,
    gigantamax: 34,
    regional: 58,
    pokemonImages: 7296,
    itemImages: 2
  };
  const actual = manifest.counts;
  if (actual.pokemon !== expected.pokemon) fail(`Pokemon count: ${actual.pokemon}`);
  for (const kind of FORM_KINDS) {
    if (actual.forms[kind] !== expected[kind]) {
      fail(`${kind} form count: ${actual.forms[kind]}`);
    }
  }
  if (actual.pokemonImages !== expected.pokemonImages) {
    fail(`Pokemon image count: ${actual.pokemonImages}`);
  }
  if (actual.itemImages !== expected.itemImages) fail(`Item image count: ${actual.itemImages}`);
}

function prepare() {
  if (fs.existsSync(MANIFEST_JSON)) {
    fail("manifest.json already exists; refusing to rebuild over an existing migration");
  }
  const manifest = buildManifest();
  validateManifestCounts(manifest);

  let copied = 0;
  let reused = 0;
  for (const [legacyPath, canonicalPath] of Object.entries(manifest.legacyToCanonical)) {
    const source = webPathToFile(legacyPath);
    const target = webPathToFile(canonicalPath);
    if (!fs.existsSync(source)) fail(`Missing source: ${legacyPath}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      if (sha256(source) !== sha256(target)) {
        fail(`Different target already exists: ${canonicalPath}`);
      }
      reused += 1;
      continue;
    }
    fs.copyFileSync(source, target);
    copied += 1;
  }

  fs.writeFileSync(MANIFEST_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(MANIFEST_JS, renderRuntimeManifest(manifest));
  console.log(`Prepared ${copied} images (${reused} already identical).`);
  console.log(`Manifest: ${path.relative(CORE_DIR, MANIFEST_JSON)}`);
}

function walkFiles(root, predicate) {
  const results = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(filePath);
      else if (entry.isFile() && predicate(filePath)) results.push(filePath);
    }
  }
  return results.sort();
}

function rewrite() {
  const manifest = loadManifest();
  validateManifestCounts(manifest);
  if (!manifest.legacyToCanonical) {
    fail("The finalized manifest no longer contains a legacy rewrite map");
  }
  const files = [
    DATA_JS,
    path.join(ARENA_DIR, "index.html"),
    path.join(POKE_DATA_DIR, "pokeData.js"),
    ...walkFiles(POKE_DATA_DIR, (filePath) => filePath.endsWith(".json"))
  ];
  const mappings = new Map(Object.entries(manifest.legacyToCanonical));
  const spritePathPattern = /\.\.\/pokeSprite\/[A-Za-z0-9_./-]+\.(?:gif|png)/g;
  let changedFiles = 0;
  let replacements = 0;

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, "utf8");
    let changed = false;
    const source = original.replace(spritePathPattern, (legacyPath) => {
      const canonicalPath = mappings.get(legacyPath);
      if (!canonicalPath) return legacyPath;
      replacements += 1;
      changed = true;
      return canonicalPath;
    });
    if (changed) {
      fs.writeFileSync(filePath, source);
      changedFiles += 1;
    }
  }

  console.log(`Rewrote ${replacements} references in ${changedFiles} files.`);
}

function verifyTargets(manifest, requireLegacy) {
  validateManifestCounts(manifest);
  const canonicalPaths = canonicalImagePaths(manifest);
  if (canonicalPaths.length !== manifest.counts.pokemonImages) {
    fail(`Canonical image inventory count: ${canonicalPaths.length}`);
  }
  if (new Set(canonicalPaths).size !== canonicalPaths.length) {
    fail("Canonical image paths are not unique");
  }

  let verified = 0;
  let compared = 0;
  for (const canonicalPath of canonicalPaths) {
    const target = webPathToFile(canonicalPath);
    if (!fs.existsSync(target)) fail(`Missing canonical image: ${canonicalPath}`);
    verified += 1;
  }

  const migrationMap = manifest.legacyToCanonical || {};
  if (requireLegacy && Object.keys(migrationMap).length !== canonicalPaths.length) {
    fail("Complete legacy path map is required before pruning");
  }
  for (const [legacyPath, canonicalPath] of Object.entries(migrationMap)) {
    const source = webPathToFile(legacyPath);
    const target = webPathToFile(canonicalPath);
    if (!fs.existsSync(source)) {
      if (requireLegacy) fail(`Missing legacy image before prune: ${legacyPath}`);
      continue;
    }
    if (sha256(source) !== sha256(target)) {
      fail(`Hash mismatch: ${legacyPath} -> ${canonicalPath}`);
    }
    compared += 1;
  }
  for (const itemPath of Object.values(manifest.items)) {
    if (!fs.existsSync(webPathToFile(itemPath))) fail(`Missing item image: ${itemPath}`);
  }
  return { verified, compared };
}

function referenceFiles() {
  return [
    ...walkFiles(POKE_DATA_DIR, (filePath) => filePath.endsWith(".json") || filePath.endsWith(".js")),
    ...walkFiles(ARENA_DIR, (filePath) =>
      [".html", ".css", ".js"].includes(path.extname(filePath))
    )
  ];
}

function verifyReferences(manifest) {
  const legacyPaths = new Set(Object.keys(manifest.legacyToCanonical || {}));
  const canonicalPaths = new Set(canonicalImagePaths(manifest));
  const allowedItems = new Set(Object.values(manifest.items));
  const pathPattern = /\.\.\/pokeSprite\/[A-Za-z0-9_.*?=&/-]+\.(?:gif|png)(?:\?[^"'\s<>)]+)?/g;
  let references = 0;

  for (const filePath of referenceFiles()) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const match of source.match(pathPattern) || []) {
      const webPath = match.split("?")[0];
      if (webPath.includes("*")) continue;
      references += 1;
      if (legacyPaths.has(webPath)) {
        fail(`Legacy reference remains in ${path.relative(CORE_DIR, filePath)}: ${webPath}`);
      }
      if (!canonicalPaths.has(webPath) && !allowedItems.has(webPath)) {
        fail(`Unregistered sprite reference in ${path.relative(CORE_DIR, filePath)}: ${webPath}`);
      }
      if (!fs.existsSync(webPathToFile(webPath))) {
        fail(`Referenced image does not exist: ${webPath}`);
      }
    }
  }
  return references;
}

function verify(requireLegacy) {
  const manifest = loadManifest();
  if (!fs.existsSync(MANIFEST_JS)) fail(`Runtime manifest not found: ${MANIFEST_JS}`);
  const targets = verifyTargets(manifest, requireLegacy);
  const references = verifyReferences(manifest);
  console.log(
    `Verified ${targets.verified} canonical images, ${targets.compared} source hashes, ` +
      `${references} text references, and ${manifest.counts.itemImages} item images.`
  );
}

function prune() {
  const manifest = loadManifest();
  verifyTargets(manifest, true);
  verifyReferences(manifest);

  const rootDotStore = path.join(SPRITE_DIR, ".DS_Store");
  if (fs.existsSync(rootDotStore)) fs.rmSync(rootDotStore);

  for (const directory of LEGACY_ROOT_DIRS) {
    const target = path.join(SPRITE_DIR, directory);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true });
  }

  for (let generation = 1; generation <= 9; generation += 1) {
    const generationDir = path.join(SPRITE_DIR, `gen${generation}`);
    for (const entry of fs.readdirSync(generationDir, { withFileTypes: true })) {
      const entryPath = path.join(generationDir, entry.name);
      if (entry.isFile()) {
        fs.rmSync(entryPath);
        continue;
      }
      if (entry.isDirectory() && LEGACY_GENERATION_DIRS.includes(entry.name)) {
        fs.rmSync(entryPath, { recursive: true });
        continue;
      }
      if (entry.isDirectory() && !/^\d{4}_[a-z0-9-]+$/.test(entry.name)) {
        fail(`Refusing to remove or ignore unexpected generation entry: ${entryPath}`);
      }
    }
  }

  for (const form of formsInManifest(manifest)) delete form.legacy;
  delete manifest.legacyToCanonical;
  manifest.migrationCompleted = true;
  fs.writeFileSync(MANIFEST_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(MANIFEST_JS, renderRuntimeManifest(manifest));

  console.log("Removed the verified legacy sprite tree; canonical hierarchy and items remain.");
}

function printHelp() {
  console.log("Usage: migrate-sprites.js <prepare|rewrite|verify-copy|prune|verify>");
}

const command = process.argv[2];
try {
  if (command === "prepare") prepare();
  else if (command === "rewrite") rewrite();
  else if (command === "verify-copy") verify(true);
  else if (command === "prune") prune();
  else if (command === "verify") verify(false);
  else {
    printHelp();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
