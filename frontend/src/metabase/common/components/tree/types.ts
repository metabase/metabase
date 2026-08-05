import type { IconProps } from "metabase/ui";
import type { IconName } from "metabase-types/api";
export interface ITreeNodeItem<TData = unknown> {
  id: string | number;
  name: string;
  icon: IconName | IconProps;
  children?: ITreeNodeItem<TData>[];
  /**
   * Set this when a node can be expanded before its children are loaded. Defaults to whether `children` is a
   * non-empty array.
   */
  hasChildren?: boolean;
  /**
   * Set this to `false` while the node's children are still loading. The tree then shows skeleton rows in their
   * place. Defaults to `true`.
   */
  childrenLoaded?: boolean;
  /**
   * Set this when the node's level of children was cut short. The tree renders a "Show more" row after them.
   */
  childrenHaveMore?: boolean;
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
  /**
   * Called when the pointer settles on the node. A lazily loaded tree uses this to fetch the node's children before
   * the click arrives.
   */
  onHover?: () => void;
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
