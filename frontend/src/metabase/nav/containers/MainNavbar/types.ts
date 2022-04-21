export type SelectedEntityItem = {
  type: "card" | "collection" | "dashboard";
  id?: number | string;
};

export type SelectedNonEntityItem = {
  type: "unknown";
  url: string;
};

type HomepageItem = {
  type: "homepage";
};

export type SelectedItem =
  | SelectedEntityItem
  | SelectedNonEntityItem
  | HomepageItem;
