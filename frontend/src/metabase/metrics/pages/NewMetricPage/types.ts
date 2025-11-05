import type { Field } from "metabase-types/api";

export type NewMetricValues = {
  name: string;
  description: string | null;
  resultMetadata: Field[] | null;
};
