import type { ISO8601Time } from ".";

import type { Field } from "./Field";
import type { Segment } from "./Segment";
import type { Metric } from "./Metric";
import type { DatabaseId } from "./Database";

export type TableId = number;
export type SchemaName = string;

type TableVisibilityType = string; // FIXME

// TODO: incomplete
export type Table = {
  id: TableId,
  db_id: DatabaseId,

  schema: ?SchemaName,
  name: string,
  display_name: string,

  description: string,
  active: boolean,
  visibility_type: TableVisibilityType,

  // entity_name:          null // unused?
  // entity_type:          null // unused?

  fields: Field[],
  segments: Segment[],
  metrics: Metric[],

  rows: number,

  caveats: ?string,
  points_of_interest: ?string,
  show_in_getting_started: boolean,

  updated_at: ISO8601Time,
  created_at: ISO8601Time,
};
