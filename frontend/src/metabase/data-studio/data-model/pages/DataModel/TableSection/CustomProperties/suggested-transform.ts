import type { DatabaseId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

export const SUGGESTED_TRANSFORM_CARD_ID = 9301;

const STORAGE_KEY = "metabase-prototype-suggested-transform";

export type SuggestedTransform = {
  name: string;
  databaseId: DatabaseId;
  sql: string;
};

export function parseSuggestedTransform(
  value: unknown,
): SuggestedTransform | null {
  if (
    !isObject(value) ||
    typeof value.name !== "string" ||
    typeof value.databaseId !== "number" ||
    typeof value.sql !== "string"
  ) {
    return null;
  }
  return { name: value.name, databaseId: value.databaseId, sql: value.sql };
}

export function saveSuggestedTransform(transform: SuggestedTransform) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transform));
}

export function readSuggestedTransform(): SuggestedTransform | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw == null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return parseSuggestedTransform(value);
  } catch {
    return null;
  }
}
