import { createEntity } from "metabase/lib/entities";
import { BookmarkSchema } from "metabase/schema";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,

  api: {
    list: async () => [{ aKey: "aValue" }],
    // list: () =>
    //   new Promise(resolve => {
    //     setTimeout(() => {
    //       resolve([{ aKey: "aValue" }]);
    //     });
    //   }),
    // list: new Promise(resolve => {
    //   setTimeout(() => {
    //     resolve([{ aKey: "AValue" }]);
    //   }, 300);
    // }),
  },
});

export default Bookmarks;
