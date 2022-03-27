import { IconProps } from "../Icon";

export interface ITreeNodeItem {
  id: string | number;
  name: string;
  icon: string | IconProps;
  children?: ITreeNodeItem[];
}

export interface TreeNodeProps {
  item: ITreeNodeItem;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
}
