import { createEntity } from "metabase/lib/entities";
import { BookmarkSchema } from "metabase/schema";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,

  api: {
    list: async () => [
      { id: 1, aKey: "aValue" },
      { id: 2, aKey: "anotherValue" },
    ],
  },
});

export default Bookmarks;
