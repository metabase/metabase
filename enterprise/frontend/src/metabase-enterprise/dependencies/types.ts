import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";

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

export type DependencyErrorInfo = {
  label: string;
  detail: string | null;
};
