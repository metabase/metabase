const CONTENT_PATH_PREFIX = "/embed/permission-preview-content/";

const ITEM_ID_PATTERN = /^(\d+)(?:-.*)?$/;

/** What the frame shows for a link that names no item it can open. */
export const NOT_FOUND_ITEM = "not-found";

/** The frame's start: every collection the person can reach. */
export const ALL_COLLECTIONS_ITEM = "collection/all";

export type PreviewItem =
  | { type: "collection"; id: number | "root" | "all" }
  | { type: "dashboard"; id: number }
  | { type: "question"; id: number };

export function getContentUrl(item: string) {
  return `${CONTENT_PATH_PREFIX}${item}`;
}

export function isContentPath(pathname: string) {
  return pathname.startsWith(CONTENT_PATH_PREFIX);
}

export function getItemFromContentPath(pathname: string) {
  return pathname.slice(CONTENT_PATH_PREFIX.length);
}

/**
 * The item a pasted link names, as `type/id` (`dashboard/12`), or
 * `NOT_FOUND_ITEM` when it names none. The root path is All collections;
 * models and metrics open as questions.
 */
export function getItemFromLink(input: string) {
  const text = input.trim();

  if (text === "") {
    return NOT_FOUND_ITEM;
  }

  const segments = getPathSegments(text);

  if (!segments) {
    return NOT_FOUND_ITEM;
  }
  if (segments.length === 0) {
    return ALL_COLLECTIONS_ITEM;
  }

  const [type, slug] = segments;
  const id = slug?.match(ITEM_ID_PATTERN)?.[1];

  if (type === "collection" && (slug === "root" || slug === "all")) {
    return `collection/${slug}`;
  }
  if (id && (type === "collection" || type === "dashboard")) {
    return `${type}/${id}`;
  }
  if (id && (type === "question" || type === "model" || type === "metric")) {
    return `question/${id}`;
  }
  return NOT_FOUND_ITEM;
}

export function parseItem(item: string): PreviewItem | null {
  const [type, id] = item.split("/");

  if (type === "collection" && (id === "root" || id === "all")) {
    return { type, id };
  }
  if (
    id &&
    /^\d+$/.test(id) &&
    (type === "collection" || type === "dashboard" || type === "question")
  ) {
    return { type, id: Number(id) };
  }
  return null;
}

/** The address box's text for an item: the path a person would see in Metabase. */
export function getLinkText(item: string) {
  return item === ALL_COLLECTIONS_ITEM ? "/" : `/${item}`;
}

function getPathSegments(text: string) {
  try {
    return new URL(text, "http://metabase.invalid").pathname
      .split("/")
      .filter(Boolean);
  } catch {
    return null;
  }
}
