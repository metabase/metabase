import type { DependencyError, DependencyErrorType } from "metabase-types/api";

export type DependencyErrorGroup = {
  type: DependencyErrorType;
  errors: DependencyError[];
};
