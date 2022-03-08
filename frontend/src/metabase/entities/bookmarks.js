import { POST, DELETE } from "metabase/lib/api";
import { createEntity } from "metabase/lib/entities";
import { BookmarkSchema } from "metabase/schema";

const Bookmarks = createEntity({
  name: "bookmarks",
  nameOne: "bookmark",
  path: "/api/bookmark",
  schema: BookmarkSchema,
  api: {
    create: POST("/api/bookmark/card/:id"),
    delete: DELETE("/api/bookmark/card/:id"),
  },
});

export default Bookmarks;
