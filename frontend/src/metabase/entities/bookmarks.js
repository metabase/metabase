import { createEntity } from "metabase/lib/entities";

// import { BookmarkSchema } from "metabase/schema";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  // schema: BookmarkSchema,
  // objectActions: {
  //   setArchived: ({ id }, archived, opts) => console.log(id, archived, opts),
  // },
});

export default Bookmarks;
