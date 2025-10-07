import type { DependencyEntry } from "metabase-types/api";

export type DependencyLineageParams = {
  entry?: DependencyEntry;
};

export type DependencyLineageRawParams = {
  id?: string;
  type?: string;
};
