/**
 * PROTOTYPE: the localStorage key prefix for what loading skeletons remember
 * of a user's pages, such as a dashboard's layout or how many rows a list had,
 * so a later load draws that shape. Everything under it is forgotten on
 * sign-out.
 */
export const REMEMBERED_SKELETON_KEY_PREFIX =
  "metabase-prototype-remembered-skeleton:";

/** How the list on a page looked when it was last shown. */
export type RememberedList = {
  rows: number;
  /** The height of its empty state, when it had no rows. */
  emptyHeight?: number;
};

const LISTS_KEY = `${REMEMBERED_SKELETON_KEY_PREFIX}lists`;
const MAX_LISTS = 100;

const readLists = (): Record<string, RememberedList> => {
  try {
    // Written only by `rememberList`, so it has this shape
    return JSON.parse(window.localStorage.getItem(LISTS_KEY) ?? "{}") as Record<
      string,
      RememberedList
    >;
  } catch {
    return {};
  }
};

/** How the list on this page looked last time, if it's known. */
export const getRememberedList = (): RememberedList | undefined =>
  readLists()[window.location.pathname];

/** Remembers how the list on this page looks, for its next load. */
export const rememberList = (list: RememberedList) => {
  const lists = readLists();
  const page = window.location.pathname;
  const previous = lists[page];
  if (
    previous?.rows === list.rows &&
    previous?.emptyHeight === list.emptyHeight
  ) {
    return;
  }

  // Most recently shown last, so the oldest are the first to go
  delete lists[page];
  lists[page] = list;
  const pages = Object.keys(lists);
  for (const stalePage of pages.slice(0, pages.length - MAX_LISTS)) {
    delete lists[stalePage];
  }

  try {
    window.localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
  } catch {
    // Storage full or unavailable: the next load draws the default rows
  }
};
