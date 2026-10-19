#!/usr/bin/env python3
"""Build lightweight, transparent, one-shot attack-effect GIFs.

The source artwork is kept as high-resolution RGBA PNGs.  This script turns
those masters into small, purpose-specific animations for the browser game.
It intentionally omits the GIF loop extension so each file plays once; the
game restarts an animation by creating a fresh image URL when an attack fires.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageEnhance


CANVAS_SIZE = 320
CONTENT_SIZE = 274
ALPHA_CROP_THRESHOLD = 12
GIF_TRANSPARENCY_INDEX = 255


@dataclass(frozen=True)
class AnimationSpec:
    output_name: str
    source_name: str
    frame_count: int
    duration_ms: int
    renderer: str


@dataclass(frozen=True)
class ElementAnimationSpec:
    output_name: str
    element: str
    frame_count: int = 6
    duration_ms: int = 40


ANIMATIONS = (
    AnimationSpec("claw-strike.gif", "claw-slash.png", 6, 40, "claw"),
    AnimationSpec("fang-strike.gif", "fang-bite.png", 6, 40, "fang"),
    AnimationSpec("hand-cast.gif", "energy-orb.png", 5, 40, "hand"),
    AnimationSpec("mouth-cast.gif", "energy-orb.png", 5, 40, "mouth"),
    AnimationSpec("cannon-cast.gif", "cannon-muzzle.png", 5, 40, "cannon"),
    AnimationSpec("body-cast.gif", "impact-burst.png", 5, 40, "body"),
    AnimationSpec("hit-impact.gif", "impact-burst.png", 6, 40, "impact"),
)


ELEMENT_ANIMATIONS = (
    ElementAnimationSpec("element-water.gif", "water"),
    ElementAnimationSpec("element-electric.gif", "electric"),
    ElementAnimationSpec("element-grass.gif", "grass"),
    ElementAnimationSpec("element-ice.gif", "ice"),
    ElementAnimationSpec("element-fighting.gif", "fighting"),
    ElementAnimationSpec("element-poison.gif", "poison"),
    ElementAnimationSpec("element-ground.gif", "ground"),
    ElementAnimationSpec("element-flying.gif", "flying"),
    ElementAnimationSpec("element-psychic.gif", "psychic"),
    ElementAnimationSpec("element-bug.gif", "bug"),
    ElementAnimationSpec("element-rock.gif", "rock"),
    ElementAnimationSpec("element-ghost.gif", "ghost"),
    ElementAnimationSpec("element-dragon.gif", "dragon"),
    ElementAnimationSpec("element-dark.gif", "dark"),
    ElementAnimationSpec("element-steel.gif", "steel"),
    ElementAnimationSpec("element-fairy.gif", "fairy"),
)


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def ease_out_cubic(value: float) -> float:
    return 1.0 - (1.0 - value) ** 3


def ease_in_out(value: float) -> float:
    return 0.5 - math.cos(math.pi * value) / 2.0


def fade_envelope(t: float, attack: float = 0.16, release: float = 0.62) -> float:
    if t < attack:
        return clamp(t / attack)
    if t <= release:
        return 1.0
    return clamp((1.0 - t) / (1.0 - release))


def meaningful_alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= ALPHA_CROP_THRESHOLD else 0)
    return mask.getbbox() or (0, 0, image.width, image.height)


def load_master(path: Path) -> Image.Image:
    source = Image.open(path).convert("RGBA")
    source = source.crop(meaningful_alpha_bbox(source))
    source.thumbnail((CONTENT_SIZE, CONTENT_SIZE), Image.Resampling.LANCZOS)
    return source


def set_opacity(image: Image.Image, opacity: float) -> Image.Image:
    result = image.copy()
    alpha = result.getchannel("A").point(lambda value: round(value * clamp(opacity)))
    result.putalpha(alpha)
    return result


def transformed(
    source: Image.Image,
    *,
    scale_x: float,
    scale_y: float,
    angle: float = 0.0,
    opacity: float = 1.0,
    brightness: float = 1.0,
) -> Image.Image:
    width = max(1, round(source.width * scale_x))
    height = max(1, round(source.height * scale_y))
    image = source.resize((width, height), Image.Resampling.LANCZOS)
    if brightness != 1.0:
        image = ImageEnhance.Brightness(image).enhance(brightness)
    if angle:
        image = image.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    return set_opacity(image, opacity)


def composite_center(
    canvas: Image.Image,
    image: Image.Image,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> None:
    x = round((canvas.width - image.width) / 2 + offset_x)
    y = round((canvas.height - image.height) / 2 + offset_y)
    canvas.alpha_composite(image, (x, y))


def ink(rgb: tuple[int, int, int], opacity: float) -> tuple[int, int, int, int]:
    return (*rgb, round(255 * clamp(opacity)))


def render_claw(source: Image.Image, t: float) -> Image.Image:
    del source
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(canvas)
    envelope = fade_envelope(t, 0.08, 0.68)
    sweep = 0.22 + 0.78 * ease_out_cubic(t)
    for index, offset in enumerate((-22, 0, 22)):
        start = (100 + offset * 0.18, 202 + offset)
        full_end = (218 + offset * 0.18, 104 + offset)
        end = (
            start[0] + (full_end[0] - start[0]) * sweep,
            start[1] + (full_end[1] - start[1]) * sweep,
        )
        draw.line((start, end), fill=ink((80, 192, 255), envelope * 0.7), width=10)
        draw.line((start, end), fill=ink((246, 252, 255), envelope), width=4)
    return canvas


def render_fang(source: Image.Image, t: float) -> Image.Image:
    del source
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(canvas)
    snap = math.sin(math.pi * clamp(t / 0.7)) if t < 0.7 else 1.0
    envelope = fade_envelope(t, 0.08, 0.70)
    gap = 54 - 28 * snap
    upper_y = 160 - gap
    lower_y = 160 + gap
    accent = ink((112, 205, 255), envelope * 0.78)
    core = ink((250, 253, 255), envelope)
    draw.arc((92, 86, 228, 212), 202, 338, fill=accent, width=7)
    draw.arc((92, 108, 228, 234), 22, 158, fill=accent, width=7)
    for x, length in ((116, 22), (139, 30), (163, 34), (187, 28), (208, 20)):
        half_width = 8 if length < 30 else 10
        draw.polygon(((x - half_width, upper_y), (x + half_width, upper_y), (x, upper_y + length)), fill=core)
        draw.polygon(((x - half_width, lower_y), (x + half_width, lower_y), (x, lower_y - length)), fill=core)
    return canvas


def render_hand(source: Image.Image, t: float) -> Image.Image:
    del source
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(canvas)
    charged = ease_in_out(clamp(t / 0.58))
    release = ease_out_cubic(clamp((t - 0.45) / 0.55))
    envelope = fade_envelope(t, 0.13, 0.76)
    x = 145 + 30 * release
    radius = 10 + 25 * charged
    draw.ellipse((x - radius, 160 - radius, x + radius, 160 + radius), fill=ink((78, 172, 255), envelope * 0.64), outline=ink((225, 249, 255), envelope), width=4)
    draw.ellipse((x - radius * 0.38, 160 - radius * 0.38, x + radius * 0.38, 160 + radius * 0.38), fill=ink((255, 255, 255), envelope))
    for index in range(3):
        angle = t * math.tau + index * math.tau / 3
        px, py = polar_point(x, 160, radius + 15, angle)
        draw.ellipse((px - 3, py - 3, px + 3, py + 3), fill=ink((180, 232, 255), envelope * 0.9))
    return canvas


def render_mouth(source: Image.Image, t: float) -> Image.Image:
    del source
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(canvas)
    flight = ease_out_cubic(t)
    envelope = fade_envelope(t, 0.08, 0.72)
    start_x = 104 + 16 * flight
    tip_x = 165 + 42 * flight
    width = 22 + 16 * math.sin(math.pi * clamp(t / 0.72))
    draw.polygon(((start_x, 160 - width), (tip_x, 160), (start_x, 160 + width)), fill=ink((69, 173, 255), envelope * 0.44))
    draw.line(((start_x, 160 - width), (tip_x, 160), (start_x, 160 + width)), fill=ink((235, 252, 255), envelope), width=5, joint="curve")
    draw.ellipse((start_x - 12, 148, start_x + 12, 172), fill=ink((255, 255, 255), envelope * 0.94))
    return canvas


def render_cannon(source: Image.Image, t: float) -> Image.Image:
    del source
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(canvas)
    discharge = ease_out_cubic(clamp(t / 0.48))
    recoil = ease_out_cubic(clamp((t - 0.48) / 0.52))
    envelope = fade_envelope(t, 0.07, 0.60)
    x = 126 + 8 * discharge - 5 * recoil
    radius = 18 + 18 * math.sin(math.pi * clamp(t / 0.68))
    draw.ellipse((x - radius, 160 - radius, x + radius, 160 + radius), outline=ink((194, 240, 255), envelope), width=5)
    draw.ellipse((x - 8, 152, x + 8, 168), fill=ink((255, 255, 255), envelope))
    length = 38 + 42 * discharge
    draw.polygon(((x + 6, 151), (x + length, 160), (x + 6, 169)), fill=ink((69, 173, 255), envelope * 0.72))
    draw.line((x + 8, 160, x + length, 160), fill=ink((255, 255, 255), envelope), width=4)
    return canvas


def render_body(source: Image.Image, t: float) -> Image.Image:
    del source
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(canvas)
    pulse = ease_out_cubic(t)
    envelope = fade_envelope(t, 0.10, 0.58)
    radius = 24 + 48 * pulse
    draw.ellipse((160 - radius, 160 - radius * 0.62, 160 + radius, 160 + radius * 0.62), outline=ink((112, 205, 255), envelope * 0.78), width=6)
    draw.ellipse((148, 148, 172, 172), fill=ink((250, 253, 255), envelope * 0.95))
    for angle in (0, math.pi / 2, math.pi, math.pi * 1.5):
        inner = polar_point(160, 160, radius * 0.72, angle)
        outer = polar_point(160, 160, radius + 15, angle)
        draw.line((inner, outer), fill=ink((220, 248, 255), envelope * 0.85), width=4)
    return canvas


def render_impact(source: Image.Image, t: float) -> Image.Image:
    del source
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(canvas)
    burst = ease_out_cubic(t)
    envelope = fade_envelope(t, 0.06, 0.48)
    outer = 24 + 58 * burst
    inner = outer * 0.34
    points = star_points(160, 160, outer, inner, points=8, rotation=-math.pi / 8)
    draw.polygon(points, fill=ink((255, 255, 255), envelope * 0.92))
    draw.ellipse((160 - outer * 0.34, 160 - outer * 0.34, 160 + outer * 0.34, 160 + outer * 0.34), fill=ink((255, 224, 111), envelope))
    return canvas


RENDERERS: dict[str, Callable[[Image.Image, float], Image.Image]] = {
    "claw": render_claw,
    "fang": render_fang,
    "hand": render_hand,
    "mouth": render_mouth,
    "cannon": render_cannon,
    "body": render_body,
    "impact": render_impact,
}


def polar_point(
    center_x: float,
    center_y: float,
    radius: float,
    angle: float,
) -> tuple[float, float]:
    return (
        center_x + math.cos(angle) * radius,
        center_y + math.sin(angle) * radius,
    )


def rotated_points(
    points: list[tuple[float, float]],
    center_x: float,
    center_y: float,
    angle: float,
    scale: float = 1.0,
) -> list[tuple[float, float]]:
    cosine = math.cos(angle)
    sine = math.sin(angle)
    return [
        (
            center_x + (x * cosine - y * sine) * scale,
            center_y + (x * sine + y * cosine) * scale,
        )
        for x, y in points
    ]


def star_points(
    center_x: float,
    center_y: float,
    outer_radius: float,
    inner_radius: float,
    points: int = 5,
    rotation: float = -math.pi / 2,
) -> list[tuple[float, float]]:
    result = []
    for index in range(points * 2):
        angle = rotation + index * math.pi / points
        radius = outer_radius if index % 2 == 0 else inner_radius
        result.append(polar_point(center_x, center_y, radius, angle))
    return result


def finish_element_frame(
    core: Image.Image,
    t: float,
    *,
    glow_radius: float = 8.0,
    glow_strength: float = 0.78,
) -> Image.Image:
    envelope = fade_envelope(t, 0.07, 0.72)
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    # Keep each type-specific motif, but present it as a compact, unblurred cue.
    # The named arguments remain for compatibility with the individual renderers.
    del glow_radius, glow_strength
    core_scale = 0.72
    compact_core = core.resize(
        (round(core.width * core_scale), round(core.height * core_scale)),
        Image.Resampling.LANCZOS,
    )
    composite_center(canvas, set_opacity(compact_core, envelope))
    return canvas


def render_element_water(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = ease_out_cubic(t)
    lift = 24 * math.sin(math.pi * t)
    wave_color = (76, 202, 255, 238)
    highlight = (224, 250, 255, 255)
    draw.arc((34, 105 + lift, 256, 275 + lift), 195, 350, fill=wave_color, width=20)
    draw.arc((79, 122 + lift, 303, 264 + lift), 184, 329, fill=(42, 135, 248, 225), width=12)
    draw.arc((70, 116 + lift, 249, 245 + lift), 202, 327, fill=highlight, width=5)
    for index, (base_x, base_y, size) in enumerate(((104, 105, 18), (166, 79, 14), (224, 112, 20))):
        y = base_y - progress * (18 + index * 5)
        x = base_x + math.sin(t * math.pi * 2 + index) * 10
        draw.polygon(((x, y - size), (x - size * 0.62, y + 3), (x + size * 0.62, y + 3)), fill=wave_color)
        draw.ellipse((x - size * 0.62, y - 4, x + size * 0.62, y + size), fill=wave_color)
        draw.ellipse((x - size * 0.23, y - size * 0.15, x + 1, y + size * 0.18), fill=highlight)
    return finish_element_frame(core, t, glow_radius=9)


def render_element_electric(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    pulse = 0.78 + 0.26 * math.sin(math.pi * clamp(t / 0.78))
    bolt = rotated_points(
        [(-28, -105), (24, -37), (-2, -30), (35, 7), (2, 0), (22, 88), (-46, 17), (-14, 20)],
        160,
        157,
        -0.10,
        pulse,
    )
    draw.polygon(bolt, fill=(255, 225, 37, 255))
    inner = rotated_points(
        [(-15, -84), (11, -36), (-5, -27), (16, 3), (-3, -1), (8, 57), (-18, 14), (-7, 16)],
        160,
        157,
        -0.10,
        pulse,
    )
    draw.polygon(inner, fill=(255, 255, 238, 255))
    branch_phase = 9 * math.sin(t * math.pi * 5)
    draw.line(((141, 118), (91 + branch_phase, 93), (63, 116)), fill=(255, 238, 79, 235), width=8, joint="curve")
    draw.line(((174, 172), (225 - branch_phase, 147), (255, 172)), fill=(255, 238, 79, 235), width=8, joint="curve")
    for angle in (0.2, 2.0, 3.8, 5.2):
        x1, y1 = polar_point(160, 156, 105 + 9 * progress_value(t), angle)
        x2, y2 = polar_point(160, 156, 127 + 9 * progress_value(t), angle)
        draw.line(((x1, y1), (x2, y2)), fill=(255, 249, 174, 220), width=4)
    return finish_element_frame(core, t, glow_radius=7, glow_strength=0.92)


def progress_value(t: float) -> float:
    return ease_out_cubic(clamp(t))


def render_element_grass(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    leaf_shape = [(0, -28), (18, -5), (15, 14), (0, 30), (-15, 14), (-18, -5)]
    for index in range(6):
        angle = index * math.tau / 6 + t * 2.2
        radius = 28 + 72 * progress
        x, y = polar_point(160, 160, radius, angle)
        leaf_angle = angle + math.pi / 2
        scale = 0.72 + 0.16 * (index % 2)
        leaf = rotated_points(leaf_shape, x, y, leaf_angle, scale)
        fill = (93, 231, 74, 245) if index % 2 == 0 else (35, 176, 78, 245)
        draw.polygon(leaf, fill=fill)
        tip_a = polar_point(x, y, 22 * scale, leaf_angle - math.pi / 2)
        tip_b = polar_point(x, y, 22 * scale, leaf_angle + math.pi / 2)
        draw.line((tip_a, tip_b), fill=(220, 255, 164, 220), width=3)
    draw.ellipse((141, 141, 179, 179), fill=(183, 255, 94, 230))
    return finish_element_frame(core, t, glow_radius=8)


def render_element_ice(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    center = (160, 157)
    arm_length = 40 + 70 * progress
    color = (161, 238, 255, 255)
    for index in range(6):
        angle = index * math.pi / 3 + 0.12 * t
        end = polar_point(*center, arm_length, angle)
        draw.line((center, end), fill=color, width=8)
        for fraction in (0.55, 0.78):
            branch_center = polar_point(*center, arm_length * fraction, angle)
            for side in (-1, 1):
                branch_end = polar_point(branch_center[0], branch_center[1], 22 * progress, angle + math.pi + side * 0.62)
                draw.line((branch_center, branch_end), fill=(226, 254, 255, 245), width=5)
    draw.ellipse((145, 142, 175, 172), fill=(245, 255, 255, 255))
    for angle in (0.4, 2.1, 3.2, 5.2):
        x, y = polar_point(*center, 125 * progress, angle)
        draw.polygon(rotated_points([(0, -13), (8, 8), (0, 4), (-8, 8)], x, y, angle), fill=(110, 208, 255, 230))
    return finish_element_frame(core, t, glow_radius=9, glow_strength=0.9)


def render_element_fighting(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    x = 91 + 73 * progress
    y = 160
    skin = (255, 108, 55, 255)
    edge = (255, 211, 82, 255)
    draw.rounded_rectangle((x - 51, y - 34, x + 39, y + 49), radius=24, fill=skin, outline=edge, width=6)
    for index in range(4):
        left = x - 48 + index * 23
        draw.rounded_rectangle((left, y - 61, left + 24, y - 17), radius=10, fill=skin, outline=edge, width=5)
    draw.rounded_rectangle((x + 20, y - 8, x + 61, y + 31), radius=17, fill=(231, 70, 45, 255), outline=edge, width=5)
    burst_x = x + 76
    for index in range(9):
        angle = index * math.tau / 9
        inner = polar_point(burst_x, y, 34, angle)
        outer = polar_point(burst_x, y, 54 + 24 * progress, angle)
        draw.line((inner, outer), fill=(255, 230, 101, 235), width=6)
    return finish_element_frame(core, t, glow_radius=8, glow_strength=0.72)


def render_element_poison(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    bubbles = ((104, 187, 34), (157, 150, 47), (211, 193, 29), (207, 111, 22), (119, 99, 18))
    for index, (x, y, radius) in enumerate(bubbles):
        rise = progress * (18 + index * 8)
        wobble = math.sin(t * math.tau * 2 + index) * 8
        box = (x - radius + wobble, y - radius - rise, x + radius + wobble, y + radius - rise)
        draw.ellipse(box, fill=(154, 57, 203, 220), outline=(238, 135, 255, 255), width=5)
        draw.ellipse((box[0] + radius * 0.35, box[1] + radius * 0.25, box[0] + radius * 0.65, box[1] + radius * 0.55), fill=(255, 221, 255, 205))
    draw.ellipse((129, 191, 191, 220), fill=(96, 28, 128, 235))
    for x in (146, 174):
        draw.ellipse((x - 6, 196, x + 6, 208), fill=(227, 137, 255, 235))
    return finish_element_frame(core, t, glow_radius=9)


def render_element_ground(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    dust = ((78, 202, 42), (116, 180, 54), (159, 201, 68), (205, 176, 50), (244, 202, 38))
    for index, (x, y, radius) in enumerate(dust):
        lift = math.sin(math.pi * t) * (19 + (index % 2) * 11)
        draw.ellipse((x - radius, y - radius - lift, x + radius, y + radius - lift), fill=(181, 127, 65, 220), outline=(235, 188, 108, 230), width=4)
    for index, (x, y) in enumerate(((99, 130), (145, 101), (198, 126), (232, 101))):
        rise = progress * (16 + index * 7)
        rock = rotated_points([(-12, -8), (2, -14), (14, -2), (8, 13), (-11, 11)], x, y - rise, t * 2 + index, 0.75 + index * 0.06)
        draw.polygon(rock, fill=(116, 82, 51, 255), outline=(232, 177, 102, 255))
    draw.line(((43, 228), (278, 228)), fill=(111, 70, 38, 240), width=10)
    return finish_element_frame(core, t, glow_radius=7, glow_strength=0.6)


def render_element_flying(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    shift = -39 + 75 * progress
    for index in range(4):
        top = 71 + index * 42
        draw.arc((27 + shift - index * 8, top, 282 + shift - index * 8, top + 82), 198, 341, fill=(174, 246, 255, 235), width=8 - index)
    feather = rotated_points([(0, -46), (17, -15), (9, 31), (0, 49), (-9, 31), (-17, -15)], 180 + shift * 0.35, 146, -0.85, 0.72)
    draw.polygon(feather, fill=(225, 253, 255, 235), outline=(88, 202, 234, 255))
    draw.line((feather[0], feather[3]), fill=(77, 182, 222, 240), width=4)
    return finish_element_frame(core, t, glow_radius=9)


def render_element_psychic(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    pulse = 0.88 + 0.12 * math.sin(t * math.pi * 6)
    for index in range(3):
        radius_x = (43 + index * 33) * progress
        radius_y = (24 + index * 18) * progress
        color = ((255, 100, 246, 250), (121, 109, 255, 235), (69, 224, 255, 220))[index]
        draw.ellipse((160 - radius_x, 160 - radius_y, 160 + radius_x, 160 + radius_y), outline=color, width=7 - index)
    orb_radius = 31 * pulse
    draw.ellipse((160 - orb_radius, 160 - orb_radius, 160 + orb_radius, 160 + orb_radius), fill=(232, 133, 255, 245), outline=(255, 244, 255, 255), width=6)
    for index in range(4):
        angle = index * math.pi / 2 + t * 4.5
        x, y = polar_point(160, 160, 112 * progress, angle)
        draw.ellipse((x - 8, y - 8, x + 8, y + 8), fill=(105, 224, 255, 245))
    return finish_element_frame(core, t, glow_radius=10, glow_strength=0.92)


def render_element_bug(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    flap = 0.40 + 0.60 * abs(math.sin(t * math.pi * 4))
    wing_color = (189, 255, 105, 218)
    wing_outline = (80, 201, 53, 255)
    draw.ellipse((137, 99, 183, 219), fill=(73, 116, 37, 255), outline=(219, 255, 116, 255), width=5)
    draw.ellipse((147, 73, 173, 113), fill=(104, 167, 51, 255), outline=(219, 255, 116, 255), width=5)
    for side in (-1, 1):
        x0 = 160 + side * 13
        x1 = 160 + side * (29 + 68 * flap)
        draw.ellipse((min(x0, x1) - 7, 104, max(x0, x1) + 7, 166), fill=wing_color, outline=wing_outline, width=5)
        draw.ellipse((min(x0, x1), 159, max(x0, x1), 207), fill=(133, 237, 72, 205), outline=wing_outline, width=4)
    draw.line(((153, 79), (128, 54)), fill=(168, 244, 86, 245), width=5)
    draw.line(((167, 79), (192, 54)), fill=(168, 244, 86, 245), width=5)
    for y in (135, 160, 186):
        draw.line(((144, y), (176, y)), fill=(211, 255, 108, 230), width=4)
    glint_x = 90 + 140 * progress_value(t)
    draw.polygon(star_points(glint_x, 91, 9, 3, 4), fill=(240, 255, 178, 235))
    return finish_element_frame(core, t, glow_radius=8)


def render_element_rock(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    stones = ((0.1, 64, 1.0), (1.25, 83, 0.72), (2.35, 94, 0.88), (3.35, 73, 0.65), (4.35, 98, 0.82), (5.45, 82, 0.68))
    base = [(-24, -17), (1, -29), (24, -12), (20, 17), (-5, 27), (-27, 9)]
    for index, (angle, distance, scale) in enumerate(stones):
        x, y = polar_point(160, 160, 21 + distance * progress, angle)
        rock = rotated_points(base, x, y, angle + t * (1.2 + index * 0.1), scale)
        fill = (132 + index * 7, 115 + index * 5, 95 + index * 4, 255)
        draw.polygon(rock, fill=fill, outline=(232, 209, 166, 255))
        draw.line((rock[1], rock[3]), fill=(83, 73, 66, 190), width=3)
    return finish_element_frame(core, t, glow_radius=6, glow_strength=0.55)


def render_element_ghost(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    bob = -18 * math.sin(math.pi * t)
    center_y = 157 + bob
    aura = (135, 70, 242, 238)
    draw.ellipse((91, center_y - 70, 229, center_y + 57), fill=aura, outline=(220, 157, 255, 255), width=6)
    draw.polygon(((91, center_y + 12), (92, center_y + 83), (127, center_y + 53), (151, center_y + 88), (177, center_y + 50), (226, center_y + 76), (229, center_y + 12)), fill=aura)
    for x in (132, 188):
        draw.ellipse((x - 10, center_y - 23, x + 10, center_y - 2), fill=(26, 17, 64, 255))
        draw.ellipse((x - 5, center_y - 19, x, center_y - 13), fill=(255, 239, 255, 255))
    draw.arc((142, center_y - 2, 178, center_y + 33), 18, 164, fill=(35, 17, 69, 250), width=5)
    for index, angle in enumerate((0.0, 2.6, 4.0)):
        x, y = polar_point(160, center_y, 103 * progress, angle + t)
        radius = 9 + index * 2
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(187, 113, 255, 220))
    return finish_element_frame(core, t, glow_radius=12, glow_strength=0.9)


def render_element_dragon(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    spiral = []
    for index in range(52):
        ratio = index / 51
        angle = ratio * math.tau * 1.55 + t * 3.0
        radius = (12 + 103 * ratio) * progress
        spiral.append(polar_point(160, 160, radius, angle))
    draw.line(spiral, fill=(80, 245, 202, 245), width=14, joint="curve")
    draw.line(spiral, fill=(239, 145, 255, 235), width=5, joint="curve")
    head_x, head_y = spiral[-1]
    head_angle = math.tau * 1.55 + t * 3.0
    head = rotated_points([(-24, -17), (6, -25), (29, 0), (4, 23), (-25, 15), (-10, 0)], head_x, head_y, head_angle)
    draw.polygon(head, fill=(90, 223, 190, 255), outline=(255, 177, 255, 255))
    for side in (-1, 1):
        horn = rotated_points([(0, 0), (-17, side * 7), (-7, side * 22)], head_x, head_y, head_angle)
        draw.polygon(horn, fill=(235, 163, 255, 245))
    return finish_element_frame(core, t, glow_radius=10, glow_strength=0.88)


def render_element_dark(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    radius = 78 + 27 * progress
    center_x = 153
    center_y = 157
    draw.ellipse((center_x - radius, center_y - radius, center_x + radius, center_y + radius), fill=(61, 25, 99, 255), outline=(180, 68, 255, 255), width=8)
    cut_radius = radius * 0.88
    draw.ellipse((center_x - 11 - cut_radius, center_y - cut_radius, center_x - 11 + cut_radius, center_y + cut_radius), fill=(0, 0, 0, 0))
    for index in range(3):
        y = 107 + index * 49
        shift = 25 * progress
        draw.line(((134 - shift, y + 20), (229 + shift, y - 20)), fill=(220, 61, 137, 230), width=7 - index)
    for angle in (0.35, 5.93):
        x, y = polar_point(164, 157, radius + 15, angle)
        draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(248, 95, 187, 235))
    return finish_element_frame(core, t, glow_radius=13, glow_strength=0.92)


def render_element_steel(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    offset = 28 * (1.0 - progress)
    for width, color in ((22, (89, 151, 184, 205)), (11, (222, 246, 255, 255)), (4, (255, 255, 255, 255))):
        draw.line(((73 - offset, 232 + offset), (244 + offset, 70 - offset)), fill=color, width=width)
        draw.line(((88 - offset, 68 - offset), (239 + offset, 225 + offset)), fill=color, width=width)
    draw.polygon(star_points(160, 153, 44 + 18 * progress, 12, 8), fill=(245, 255, 255, 255), outline=(104, 193, 232, 255))
    for index, angle in enumerate((0.0, 0.8, 2.1, 3.0, 4.15, 5.3)):
        start = polar_point(160, 153, 58, angle)
        end = polar_point(160, 153, 94 + index * 4, angle)
        draw.line((start, end), fill=(184, 237, 255, 240), width=5)
    return finish_element_frame(core, t, glow_radius=8, glow_strength=0.87)


def render_element_fairy(t: float) -> Image.Image:
    core = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    draw = ImageDraw.Draw(core)
    progress = progress_value(t)
    stars = ((160, 154, 48), (100, 102, 24), (225, 112, 20), (105, 220, 17), (226, 211, 26))
    colors = ((255, 154, 234, 255), (255, 245, 157, 250), (182, 154, 255, 250), (140, 237, 255, 245), (255, 189, 239, 245))
    for index, ((base_x, base_y, radius), color) in enumerate(zip(stars, colors)):
        angle = index * 1.27 + t * (1.8 if index % 2 == 0 else -2.0)
        distance = (20 + index * 7) * (1.0 - progress) if index else 0
        x, y = polar_point(base_x, base_y, distance, angle)
        scale = 0.55 + 0.45 * math.sin(math.pi * clamp(t / 0.82))
        draw.polygon(star_points(x, y, radius * scale, radius * 0.38 * scale, 5, angle), fill=color)
    for index in range(9):
        angle = index * math.tau / 9 + t * 3.2
        x, y = polar_point(160, 160, 74 + 38 * progress, angle)
        size = 3 + index % 3
        draw.ellipse((x - size, y - size, x + size, y + size), fill=(255, 241, 255, 240))
    return finish_element_frame(core, t, glow_radius=11, glow_strength=0.92)


ELEMENT_RENDERERS: dict[str, Callable[[float], Image.Image]] = {
    "water": render_element_water,
    "electric": render_element_electric,
    "grass": render_element_grass,
    "ice": render_element_ice,
    "fighting": render_element_fighting,
    "poison": render_element_poison,
    "ground": render_element_ground,
    "flying": render_element_flying,
    "psychic": render_element_psychic,
    "bug": render_element_bug,
    "rock": render_element_rock,
    "ghost": render_element_ghost,
    "dragon": render_element_dragon,
    "dark": render_element_dark,
    "steel": render_element_steel,
    "fairy": render_element_fairy,
}


def rgba_to_gif_frame(frame: Image.Image) -> Image.Image:
    """Quantize RGB while reserving palette index 255 for transparency."""
    alpha = frame.getchannel("A")
    palette_image = frame.convert("RGB").quantize(
        colors=255,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.FLOYDSTEINBERG,
    )
    transparent_mask = alpha.point(lambda value: 255 if value < 28 else 0)
    palette_image.paste(GIF_TRANSPARENCY_INDEX, mask=transparent_mask)
    palette = palette_image.getpalette() or []
    palette += [0] * (768 - len(palette))
    palette[GIF_TRANSPARENCY_INDEX * 3 : GIF_TRANSPARENCY_INDEX * 3 + 3] = [0, 0, 0]
    palette_image.putpalette(palette)
    palette_image.info["transparency"] = GIF_TRANSPARENCY_INDEX
    return palette_image


def build_animation(spec: AnimationSpec, source_dir: Path, output_dir: Path) -> Path:
    source_path = source_dir / spec.source_name
    if not source_path.is_file():
        raise FileNotFoundError(f"Missing source image: {source_path}")

    master = load_master(source_path)
    renderer = RENDERERS[spec.renderer]
    frames = [
        rgba_to_gif_frame(renderer(master, index / (spec.frame_count - 1)))
        for index in range(spec.frame_count)
    ]

    output_path = output_dir / spec.output_name
    frames[0].save(
        output_path,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=spec.duration_ms,
        disposal=2,
        transparency=GIF_TRANSPARENCY_INDEX,
        optimize=True,
    )
    return output_path


def build_element_animation(spec: ElementAnimationSpec, output_dir: Path) -> Path:
    renderer = ELEMENT_RENDERERS[spec.element]
    frames = [
        rgba_to_gif_frame(renderer(index / (spec.frame_count - 1)))
        for index in range(spec.frame_count)
    ]
    output_path = output_dir / spec.output_name
    frames[0].save(
        output_path,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=spec.duration_ms,
        disposal=2,
        transparency=GIF_TRANSPARENCY_INDEX,
        optimize=True,
    )
    return output_path


def validate_animation(
    path: Path,
    spec: AnimationSpec | ElementAnimationSpec,
) -> None:
    peak_visible_pixels = 0
    max_visible_edge = 0
    with Image.open(path) as image:
        actual_frames = getattr(image, "n_frames", 1)
        if image.format != "GIF":
            raise ValueError(f"{path} is not a GIF")
        if image.size != (CANVAS_SIZE, CANVAS_SIZE):
            raise ValueError(f"{path} has unexpected size {image.size}")
        if actual_frames != spec.frame_count:
            raise ValueError(
                f"{path} has {actual_frames} frames; expected {spec.frame_count}"
            )
        if "transparency" not in image.info:
            raise ValueError(f"{path} does not declare transparency")
        if "loop" in image.info:
            raise ValueError(f"{path} unexpectedly contains a loop extension")
        for frame_index in range(actual_frames):
            image.seek(frame_index)
            duration = image.info.get("duration")
            if duration != spec.duration_ms:
                raise ValueError(
                    f"{path} frame {frame_index} is {duration}ms; "
                    f"expected {spec.duration_ms}ms"
                )
            alpha = image.convert("RGBA").getchannel("A")
            histogram = alpha.histogram()
            peak_visible_pixels = max(peak_visible_pixels, sum(histogram[28:]))
            visible_bbox = alpha.point(lambda value: 255 if value >= 28 else 0).getbbox()
            if visible_bbox:
                max_visible_edge = max(
                    max_visible_edge,
                    visible_bbox[2] - visible_bbox[0],
                    visible_bbox[3] - visible_bbox[1],
                )

    coverage = peak_visible_pixels / (CANVAS_SIZE * CANVAS_SIZE)
    if isinstance(spec, ElementAnimationSpec):
        if coverage > 0.18 or max_visible_edge > 224:
            raise ValueError(
                f"{path} exceeds the element visual budget: "
                f"coverage={coverage:.3f}, max edge={max_visible_edge}px"
            )
    elif spec.renderer in {"claw", "fang", "impact"}:
        if coverage > 0.15 or max_visible_edge > 210:
            raise ValueError(
                f"{path} exceeds the physical visual budget: "
                f"coverage={coverage:.3f}, max edge={max_visible_edge}px"
            )
    elif coverage > 0.16 or max_visible_edge > 220:
        raise ValueError(
            f"{path} exceeds the charge visual budget: "
            f"coverage={coverage:.3f}, max edge={max_visible_edge}px"
        )


def validate_manifest_timing(asset_root: Path) -> None:
    manifest_path = asset_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assets_by_filename = {
        Path(asset["src"]).name: asset
        for asset in manifest.get("assets", {}).values()
    }
    for spec in (*ANIMATIONS, *ELEMENT_ANIMATIONS):
        asset = assets_by_filename.get(spec.output_name)
        if not asset:
            raise ValueError(f"{spec.output_name} is missing from {manifest_path}")
        expected_duration = spec.frame_count * spec.duration_ms
        if asset.get("durationMs") != expected_duration:
            raise ValueError(
                f"{spec.output_name} manifest duration is {asset.get('durationMs')}ms; "
                f"expected {expected_duration}ms"
            )


def parse_args() -> argparse.Namespace:
    game_imp_core = Path(__file__).resolve().parents[1]
    asset_root = game_imp_core / "pokemon-arena-2d" / "assets" / "attack-effects"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=asset_root / "source")
    parser.add_argument("--output-dir", type=Path, default=asset_root / "gif")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for spec in ANIMATIONS:
        output_path = build_animation(spec, args.source_dir, args.output_dir)
        validate_animation(output_path, spec)
        size_kib = output_path.stat().st_size / 1024
        fps = 1000 / spec.duration_ms
        print(
            f"{output_path.name}: {spec.frame_count} frames, {fps:.1f} fps, "
            f"{CANVAS_SIZE}x{CANVAS_SIZE}, {size_kib:.1f} KiB"
        )
    for spec in ELEMENT_ANIMATIONS:
        output_path = build_element_animation(spec, args.output_dir)
        validate_animation(output_path, spec)
        size_kib = output_path.stat().st_size / 1024
        if size_kib >= 500:
            raise ValueError(
                f"{output_path.name} is {size_kib:.1f} KiB; expected under 500 KiB"
            )
        fps = 1000 / spec.duration_ms
        print(
            f"{output_path.name}: {spec.frame_count} frames, {fps:.1f} fps, "
            f"{CANVAS_SIZE}x{CANVAS_SIZE}, {size_kib:.1f} KiB"
        )
    validate_manifest_timing(args.output_dir.parent)


if __name__ == "__main__":
    main()
