import { createEntity } from "metabase/lib/entities";
import { BookmarkSchema } from "metabase/schema";
import { BookmarkApi } from "metabase/services";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,
  api: {
    create: async params => {
      const [entity, id] = params.id.split("-");

      switch (entity) {
        case "card":
          return BookmarkApi.card.create({ id });
        case "collection":
          return BookmarkApi.collection.create({ id });
        default:
          throw new Error();
      }
    },
    delete: async params => {
      const [entity, id] = params.id.split("-");

      switch (entity) {
        case "card":
          return BookmarkApi.card.delete({ id });
        case "collection":
          return BookmarkApi.collection.delete({ id });
        default:
          throw new Error();
      }
    },
  },
});

export default Bookmarks;
