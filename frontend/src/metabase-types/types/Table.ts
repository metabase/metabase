import { Field } from "./Field";
import { DatabaseId } from "./Database";

import { ForeignKey } from "metabase-types/api/foreignKey";
import { Metric } from "metabase-types/api/metric";
import { Segment } from "metabase-types/api/segment";
import { SchemaName, TableId } from "metabase-types/api/table";
import { ISO8601Time } from "metabase-types/api/time";

type TableVisibilityType = string; // FIXME

// TODO: incomplete
export type Table = {
  id: TableId;
  db_id: DatabaseId;

  schema?: SchemaName;
  name: string;
  display_name: string;

  description: string;
  active: boolean;
  visibility_type: TableVisibilityType;

  // entity_type:          null // unused?

  fields: Field[];
  segments: Segment[];
  metrics: Metric[];

  rows: number;

  caveats?: string;
  points_of_interest?: string;
  show_in_getting_started: boolean;

  fks?: ForeignKey[];
  objectName: () => string;

  updated_at: ISO8601Time;
  created_at: ISO8601Time;
};
