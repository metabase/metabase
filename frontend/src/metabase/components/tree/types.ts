import { IconProps } from "../Icon";

export interface ITreeNodeItem {
  id: string | number;
  name: string;
  icon: string | IconProps;
  children?: ITreeNodeItem[];
}
