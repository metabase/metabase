export type SelectedEntityItem = {
  type: "card" | "collection" | "dashboard";
  id?: number | string;
};

export type SelectedNonEntityItem = {
  type: "non-entity";
  url: string;
};

export type SelectedItem = SelectedEntityItem | SelectedNonEntityItem;
