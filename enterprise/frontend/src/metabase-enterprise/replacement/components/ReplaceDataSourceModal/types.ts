import type {
  DependencyNode,
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

export type DescendantsTabInfo = {
  type: "descendants";
  nodes: DependencyNode[];
};

export type ErrorTabInfo = {
  type: ReplaceSourceErrorType;
  error: ReplaceSourceError;
};

export type TabInfo = DescendantsTabInfo | ErrorTabInfo;
export type TabType = TabInfo["type"];

export type ValidationInfo = {
  isValid: boolean;
  errorMessage?: string;
};

export type EmptyStateType = "default" | "no-dependents";
