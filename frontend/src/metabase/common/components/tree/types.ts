import type { IconProps } from "metabase/ui";
import type { IconName } from "metabase-types/api";
export interface ITreeNodeItem<TData = unknown> {
  id: string | number;
  name: string;
  icon: IconName | IconProps;
  children?: ITreeNodeItem<TData>[];
  data?: TData;
  nonNavigable?: boolean;
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
