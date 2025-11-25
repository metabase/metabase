import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { TableSymlinkSchema } from "metabase/schema";
import type { CollectionItem } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const TableSymlinks = createEntity({
  name: "tableSymlinks",
  nameOne: "tableSymlink",
  schema: TableSymlinkSchema,
  objectSelectors: {
    getUrl: ({ table_id, database_id }: CollectionItem) =>
      table_id != null && database_id != null
        ? Urls.queryBuilderTable(table_id, database_id)
        : "",
    getIcon: () => ({ name: "table" }),
  },
});
