import type {
  CardType,
  DependencyGroupType,
  DependencySortColumn,
  DependencySortDirection,
  DependencyType,
} from "metabase-types/api";

export const AVAILABLE_GROUP_TYPES: DependencyGroupType[] = [
  "table",
  "model",
  "metric",
];

export const PAGE_SIZE = 25;

export const DEFAULT_TYPES: DependencyType[] = ["card"];

export const DEFAULT_CARD_TYPES: CardType[] = ["model", "metric"];

export const DEFAULT_SORT_COLUMN: DependencySortColumn = "name";

export const DEFAULT_SORT_DIRECTION: DependencySortDirection = "asc";
