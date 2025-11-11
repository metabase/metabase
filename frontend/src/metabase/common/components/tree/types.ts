import type * as React from "react";

import type { IconName, IconProps } from "metabase/ui";

export interface ITreeNodeItem<TData = unknown> {
  id: string | number;
  name: string;
  icon: IconName | IconProps;
  children?: ITreeNodeItem<TData>[];
  data?: TData;
}

export interface TreeNodeProps<TData = unknown> {
  item: ITreeNodeItem<TData>;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  rightSection?: (item: ITreeNodeItem<TData>) => React.ReactNode;
  onSelect?: () => void;
  onToggleExpand: () => void;
  className?: string;
  classNames?: {
    root?: string;
    expandToggleButton?: string;
    iconContainer?: string;
  };
}

export type TreeNodeComponent<TData = unknown> = React.ComponentType<
  React.PropsWithChildren<
    TreeNodeProps<TData> & React.RefAttributes<HTMLLIElement>
  >
>;
