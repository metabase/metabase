import { Collection } from "./collection";

export type DataAppId = number;

export interface DataApp {
  id: DataAppId;

  collection_id: number;
  dashboard_id: number | null; // homepage
  collection: Collection;

  options: Record<string, unknown> | null;
  nav_items: null;

  created_at: string;
  updated_at: string;
}
