/**
 * An indexed entity is returned by the search endpoint and points to a single database record in a model
 * This is a special case for entities, because it doesn't have its own API endpoints, but it needs
 * to be treated as an entity (for now at least) so that it will play nicely with search
 */

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
    getUrl: ({ table }: TableSymlink) =>
      table ? Urls.queryBuilderTable(table.id, table.db_id) : "",
    getIcon: () => ({ name: "table" }),
  },
});
