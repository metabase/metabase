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
  detail: string | null;
};
