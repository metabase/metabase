import type { DependencyError, DependencyErrorType } from "metabase-types/api";

import type { DependencyErrorGroup } from "./types";

export function getDependencyErrorGroups(
  errors: DependencyError[],
): DependencyErrorGroup[] {
  const groups: Partial<Record<DependencyErrorType, DependencyError[]>> = {};
  for (const error of errors) {
    const group = groups[error.type];
    if (group) {
      group.push(error);
    } else {
      groups[error.type] = [error];
    }
  }
  return Object.values(groups).map((errors) => ({
    type: errors[0].type,
    errors,
  }));
}
