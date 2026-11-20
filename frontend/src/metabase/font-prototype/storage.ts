// PROTOTYPE: remembers the font playground settings per person (local storage).

import type { FontTuning } from "./types";

const PREFIX = "metabase-font-prototype";

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}:${key}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // storage full or blocked: settings just won't survive a reload
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stored values are only used as initial values for Leva inputs, which validate them. */
export function readStoredRecord(key: string): Record<string, unknown> {
  const value = read(key);
  return isRecord(value) ? value : {};
}

export function writeStoredRecord(key: string, value: Record<string, unknown>) {
  write(key, value);
}

export const fontTuningKey = (fontId: string) => `font:${fontId}`;

export function writeFontTuning(fontId: string, tuning: FontTuning) {
  write(fontTuningKey(fontId), tuning);
}
