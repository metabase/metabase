import type { Field } from "metabase-types/api";

export type ModelColumnUpdate = {
  name: string;
} & Partial<Field>;
