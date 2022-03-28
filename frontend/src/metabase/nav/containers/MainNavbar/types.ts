type SelectedEntityItem = {
  type: "card" | "collection" | "dashboard";
  id?: number | string;
};

type SelectedNonEntityItem = {
  type: "unknown";
  url: string;
};

export type SelectedItem = SelectedEntityItem | SelectedNonEntityItem;
