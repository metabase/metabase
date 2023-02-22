/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

import { TableId as _TableId } from "metabase-types/api";
import { ForeignKey } from "../api/foreign-key";
import { Field } from "./Field";

import { Segment } from "./Segment";
import { Metric } from "./Metric";
import { DatabaseId } from "./Database";
import { ISO8601Time } from ".";

export type TableId = _TableId;

export type SchemaName = string;

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
