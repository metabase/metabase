import { createEntity } from "metabase/lib/entities";
import { BookmarkSchema } from "metabase/schema";
import { BookmarkApi } from "metabase/services";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,
  api: {
    /*
     * For some reason, `params` seems to be filtered down
     * to an object only with the `id` key/value,
     * regardless of what is passed to te function calls below.
     *
     * So we hack it by passing `entity-id` as id, then
     * splitting, destructuring it and using that.
     */
    create: async params => {
      const { id, type } = params;
      return BookmarkApi[type].create({ id });
    },
    delete: async params => {
      const { id, type } = params;
      return BookmarkApi[type].delete({ id });
    },
  },
});

export default Bookmarks;
