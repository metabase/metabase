import * as React from "react";
import { IconName, IconProps } from "metabase/core/components/Icon";

export interface ITreeNodeItem {
  id: string | number;
  name: string;
  icon: IconName | IconProps;
  children?: ITreeNodeItem[];
}

export interface TreeNodeProps {
  item: ITreeNodeItem;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onSelect?: () => void;
  onToggleExpand: () => void;
}

export type TreeNodeComponent = React.ComponentType<
  TreeNodeProps & React.RefAttributes<HTMLLIElement>
>;
