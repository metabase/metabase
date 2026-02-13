import type {
  DependencyNode,
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

export type DescendantTabInfo = {
  type: "descendants";
  nodes: DependencyNode[];
};

export type ErrorTabInfo = {
  type: ReplaceSourceErrorType;
  error: ReplaceSourceError;
};

export type TabInfo = DescendantTabInfo | ErrorTabInfo;
export type TabType = TabInfo["type"];
