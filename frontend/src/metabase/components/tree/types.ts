export interface ITreeNodeItem {
  id: string | number;
  name: string;
  icon: string | { name: string; color: string };
  children?: ITreeNodeItem[];
}

export type ColorScheme = "admin" | "default";
