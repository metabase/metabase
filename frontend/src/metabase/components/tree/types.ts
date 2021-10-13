export type TreeNodeId = string | number;

export type TreeItem = {
  id: TreeNodeId;
  children?: TreeItem[];
  name: string;
  icon: string | any; // TODO: fix
  hasRightArrow?: boolean;
};

export type TreeColorScheme = "default" | "admin";
