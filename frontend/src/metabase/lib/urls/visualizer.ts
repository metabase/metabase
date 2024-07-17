import { utf8_to_b64url, b64hash_to_utf8 } from "metabase/lib/encoding";
import type { Card } from "metabase-types/api";

export function encodeVisualizerState(cards: Card[] = []) {
  return cards.length > 0 ? utf8_to_b64url(JSON.stringify(cards)) : "";
}

export function decodeVisualizerState(hash: string): Card[] {
  return JSON.parse(b64hash_to_utf8(hash));
}

export function visualizer(cards: Card[] = []) {
  if (cards.length > 0) {
    return `v#${encodeVisualizerState(cards)}`;
  } else {
    return `v`;
  }
}
