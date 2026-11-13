import {
  type BaseEntityId,
  isBaseEntityID,
} from "metabase-types/api/entity-id";

/** An item opened in the frame, read from its path. */
export type OpenedItem = {
  type: "card" | "dashboard" | "collection";
  id: number;
};

/** What the link bar was given: a path, an entity id, or a bare numeric ID whose type it has to ask. */
export type LinkInput =
  | { kind: "path"; path: string }
  | { kind: "entity-id"; entityId: BaseEntityId }
  | { kind: "numeric-id"; id: number };

/** The kinds of item a bare numeric ID can open. */
export const NUMERIC_ID_TYPES = [
  "question",
  "dashboard",
  "collection",
] as const;
export type NumericIdType = (typeof NUMERIC_ID_TYPES)[number];

const ITEM_PATH = /^\/(question|model|metric|dashboard|collection)\/(\d+)/;

export function parseOpenedItem(path: string): OpenedItem | null {
  const match = ITEM_PATH.exec(path);
  if (match == null) {
    return null;
  }
  const id = Number(match[2]);
  switch (match[1]) {
    case "dashboard":
      return { type: "dashboard", id };
    case "collection":
      return { type: "collection", id };
    default:
      return { type: "card", id };
  }
}

/** Reads a pasted link (any site's: only its path is kept), path, entity id or numeric ID. */
export function parseLinkInput(text: string): LinkInput | null {
  const value = text.trim();
  if (value === "") {
    return null;
  }
  if (/^\d+$/.test(value)) {
    return { kind: "numeric-id", id: Number(value) };
  }
  if (isBaseEntityID(value)) {
    return { kind: "entity-id", entityId: value };
  }
  try {
    const url = new URL(value);
    return { kind: "path", path: `${url.pathname}${url.search}${url.hash}` };
  } catch {
    return { kind: "path", path: value.startsWith("/") ? value : `/${value}` };
  }
}

export function getNumericIdPath(type: NumericIdType, id: number) {
  return `/${type}/${id}`;
}

/** The app's path for an entity the translate endpoint resolved. */
export function getEntityPath(type: string, id: number | string) {
  switch (type) {
    case "dashboard":
      return `/dashboard/${id}`;
    case "collection":
      return `/collection/${id}`;
    case "dataset":
      return `/model/${id}`;
    case "metric":
      return `/metric/${id}`;
    default:
      return `/question/${id}`;
  }
}
