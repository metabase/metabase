import { createEntity } from "metabase/lib/entities";
import { BookmarkSchema } from "metabase/schema";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,

  api: {
    list: async () => [
      { id: 1, name: "A name", type: "card", item_id: "2" },
      { id: 2, name: "Another name", type: "card", item_id: "3" },
    ],
  },
});

export default Bookmarks;
