import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import type {
  AnalysisFindingErrorType,
  DependencyGroupType,
  DependencySortColumn,
  SortDirection,
} from "metabase-types/api";

export type NodeId = string;

export type DependencyGroupTypeInfo = {
  label: string;
  color: ColorName;
};

export type NodeLink = {
  label: string;
  url: string;
};

export type NodeLocationInfo = {
  icon: IconName;
  links: NodeLink[];
};

export type DependentGroup = {
  type: DependencyGroupType;
  count: number;
};

export type DependencyError = {
  type: AnalysisFindingErrorType;
  detail?: string | null;
};

export type DependencyErrorGroup = {
  type: AnalysisFindingErrorType;
  errors: DependencyError[];
};

export type DependencyErrorInfo = {
  label: string;
  detail?: string | null;
};

export type DependencyFilterOptions = {
  groupTypes: DependencyGroupType[];
  includePersonalCollections: boolean;
};

export type DependencySortOptions = {
  column: DependencySortColumn;
  direction: SortDirection;
};
