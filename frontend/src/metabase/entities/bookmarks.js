import { DELETE } from "metabase/lib/api";
import { createEntity } from "metabase/lib/entities";
import { BookmarkSchema } from "metabase/schema";
import { BookmarkApi } from "metabase/services";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,
  api: {
    create: async (params, ...args) => {
      switch (params.entity) {
        case "card":
          return BookmarkApi.card.create(params, ...args);
        case "collection":
          return BookmarkApi.collection.create(params, ...args);
        default:
          throw new Error();
      }
    },
    delete: DELETE("/api/bookmark/card/:id"),
  },
});

export default Bookmarks;
