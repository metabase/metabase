import { t } from "ttag";

import { createEntity } from "metabase/lib/entities";

import { BookmarkSchema } from "metabase/schema";

const Bookmarks = createEntity({
  name: "bookmarks",
  path: "/api/bookmark",
  schema: BookmarkSchema,

  displayNameOne: t`bookmark`,
  displayNameMany: t`bookmarks`,
});

export default Bookmarks;
