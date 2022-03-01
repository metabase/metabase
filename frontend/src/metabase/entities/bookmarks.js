import { createEntity } from "metabase/lib/entities";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
});

export default Bookmarks;
