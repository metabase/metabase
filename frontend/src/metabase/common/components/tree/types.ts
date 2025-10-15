import type * as React from "react";

import type { IconName, IconProps } from "metabase/ui";

export interface ITreeNodeItem<TData = unknown> {
  id: string | number;
  name: string;
  icon: IconName | IconProps;
  children?: ITreeNodeItem[];
  data?: TData;
}

export interface TreeNodeProps {
  item: ITreeNodeItem;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  rightSection?: (item: ITreeNodeItem) => React.ReactNode;
  onSelect?: () => void;
  onToggleExpand: () => void;
  className?: string;
  classNames: {
    root?: string;
    expandToggleButton?: string;
    iconContainer?: string;
  };
}

export type TreeNodeComponent = React.ComponentType<
  React.PropsWithChildren<TreeNodeProps & React.RefAttributes<HTMLLIElement>>
>;
