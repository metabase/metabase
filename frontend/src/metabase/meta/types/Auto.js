/* @flow */

import type { TableId, SchemaName } from "metabase/meta/types/Table";

export type Candidate = {
  title: string,
  url: string,
  table?: {
    id: TableId,
    schema: SchemaName,
  },
};
