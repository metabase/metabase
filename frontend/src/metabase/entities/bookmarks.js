import { createEntity } from "metabase/lib/entities";
import { BookmarkSchema } from "metabase/schema";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,

  api: {
    list: async () => [
      {
        id: 1,
        name: "A name",
        type: "question",
        item_id: "2",
        slug: "2-a-name",
      },
      {
        id: 2,
        name: "Another name",
        type: "question",
        item_id: "3",
        slug: "3-another-name",
      },
    ],
  },
});

export default Bookmarks;
