import type { IconName } from "metabase/ui";

export type NodeId = string;

export type DependencyGroupTypeInfo = {
  label: string;
  color: string;
};

export type NodeLink = {
  label: string;
  url: string;
};

export type NodeLocationInfo = {
  icon: IconName;
  links: NodeLink[];
};

export type DependencyErrorInfo = {
  label: string;
  detail?: string;
};

export type DependencyListRawParams = {
  query?: string | string[];
  groupTypes?: string | string[];
  pageIndex?: string | string[];
};
