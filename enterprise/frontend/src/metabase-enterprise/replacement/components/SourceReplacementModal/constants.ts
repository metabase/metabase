import type { TagType } from "metabase/api/tags";
import type { DependencyType } from "metabase-types/api";

export const DEPENDENT_TYPES: DependencyType[] = [
  "card",
  "segment",
  "measure",
  "transform",
];

export const INVALIDATE_TAGS: TagType[] = [
  "table",
  "card",
  "transform",
  "segment",
  "measure",
  "dashboard",
];

export const MAX_WIDTH = "75rem";
