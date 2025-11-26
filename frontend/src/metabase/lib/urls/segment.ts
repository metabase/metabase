import type { Segment } from "metabase-types/api";

import { tableRowsQuery } from "./questions";

export const segment = (segment: Segment) =>
  tableRowsQuery(segment.database_id, segment.table_id, null, segment.id);
