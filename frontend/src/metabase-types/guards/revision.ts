import type {
  CardOrDashboardRevisionDiff,
  FieldDiff,
  QueryDiff,
  RevisionDiff,
  RevisionDiffKey,
  SegmentRevisionDiff,
} from "metabase-types/api";

import { isObject } from "./common";

export function isFieldDiff(value: unknown): value is FieldDiff {
  return isObject(value);
}

export function isQueryDiff(value: unknown): value is QueryDiff {
  return isObject(value) && isObject(value.before) && isObject(value.after);
}

export function isSegmentRevisionDiff(
  value: unknown,
): value is SegmentRevisionDiff {
  if (!isObject(value)) {
    return false;
  }

  return (
    isObject(value) &&
    (typeof value.name === "undefined" || isFieldDiff(value.name)) &&
    (typeof value.description === "undefined" ||
      isFieldDiff(value.description)) &&
    (typeof value.definition === "undefined" || isFieldDiff(value.definition))
  );
}

export function isCardOrDashboardRevisionDiff(
  value: unknown,
): value is CardOrDashboardRevisionDiff {
  return isObject(value) && isObject(value.before) && isObject(value.after);
}

export function isRevisionDiff(value: unknown): value is RevisionDiff {
  return isSegmentRevisionDiff(value) || isCardOrDashboardRevisionDiff(value);
}

export function isCardOrDashboardRevisionDiffKey(
  key: string,
): key is keyof CardOrDashboardRevisionDiff {
  return key === "before" || key === "after";
}

export function isSegmentRevisionDiffKey(
  key: string,
): key is keyof SegmentRevisionDiff {
  return key === "name" || key === "description" || key === "definition";
}

export function isDiffKey(key: string): key is RevisionDiffKey {
  return isCardOrDashboardRevisionDiffKey(key) || isSegmentRevisionDiffKey(key);
}
