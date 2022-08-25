export interface SelectedItem {
  type: "card" | "collection" | "dashboard" | "data-app" | "non-entity";
  id?: number | string;
  url?: string;
}
