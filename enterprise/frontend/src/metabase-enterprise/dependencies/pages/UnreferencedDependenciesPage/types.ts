import type {
  CardType,
  DependencySortColumn,
  DependencySortDirection,
  DependencyType,
} from "metabase-types/api";

export type UnreferencedDependenciesRawParams = {
  page?: string;
  "sort-column"?: string;
  "sort-direction"?: string;
};

export type UnreferencedDependenciesFilterOptions = {
  types: DependencyType[];
  cardTypes: CardType[];
};

export type UnreferencedDependenciesSortOptions = {
  column: DependencySortColumn;
  direction: DependencySortDirection;
};
