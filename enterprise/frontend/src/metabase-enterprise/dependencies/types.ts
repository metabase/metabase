import type { DependencyEntry } from "metabase-types/api";

export type DependencyFlowParams = {
  entry?: DependencyEntry;
};

export type DependencyFlowRawParams = {
  id?: string;
  type?: string;
};
