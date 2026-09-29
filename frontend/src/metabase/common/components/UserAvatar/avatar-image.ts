/**
 * Avatars are drawn from a name rather than fetched: there is no uploaded picture behind a Metabase
 * user, and generating in-process means a render never waits on an avatar service. DiceBear's
 * `glyphs` style — a shoulder silhouette under a glyph headpiece — is deterministic from its seed,
 * so the same person carries the same tile everywhere. DiceBear 10 ships styles as JSON definitions
 * (`@dicebear/styles`) rather than one package per style.
 */
import { Avatar, Style } from "@dicebear/core";
import definition from "@dicebear/styles/glyphs.json";

const glyphs = new Style(definition);

/** A tile is ~2.5 KB of escaped SVG, so each seed is drawn once per page. */
const faces = new Map<string, string>();
const MAX_CACHED_FACES = 512;

export function avatarDataUri(seed: string): string {
  const cached = faces.get(seed);

  if (cached) {
    return cached;
  }

  if (faces.size >= MAX_CACHED_FACES) {
    faces.clear();
  }

  // borderRadius 50 so the tile is a finished disc on its own, rather than depending on whatever
  // renders it clipping the ground's corners.
  const uri = new Avatar(glyphs, { seed, borderRadius: 50 }).toDataUri();
  faces.set(seed, uri);

  return uri;
}
