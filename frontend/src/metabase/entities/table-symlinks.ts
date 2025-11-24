import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { TableSymlinkSchema } from "metabase/schema";
import type { TableSymlink } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const TableSymlinks = createEntity({
  name: "tableSymlinks",
  nameOne: "tableSymlink",
  schema: TableSymlinkSchema,
  objectSelectors: {
    getUrl: ({ table_id, database_id }: TableSymlink) =>
      Urls.queryBuilderTable(table_id, database_id),
    getIcon: () => ({ name: "table" }),
  },
});
