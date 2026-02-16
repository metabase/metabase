import type {
  CardOrDashboardRevisionDiff,
  RevisionDiff,
  SegmentRevisionDiff,
} from "metabase-types/api";

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

export function isDiffKey(key: string): key is keyof RevisionDiff {
  return isCardOrDashboardRevisionDiffKey(key) || isSegmentRevisionDiffKey(key);
}
