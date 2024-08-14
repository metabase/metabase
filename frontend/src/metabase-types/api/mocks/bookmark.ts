import type { Bookmark } from "metabase-types/api";

export const createMockBookmark = (opts?: Partial<Bookmark>): Bookmark => ({
  id: "collection-1",
  name: "My Collection",
  item_id: 1,
  type: "collection",
  card_type: "question",
  ...opts,
});
