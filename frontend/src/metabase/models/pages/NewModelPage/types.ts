import type { Field } from "metabase-types/api";

export type NewModelValues = {
  name: string;
  description: string | null;
  resultMetadata: Field[] | null;
};
