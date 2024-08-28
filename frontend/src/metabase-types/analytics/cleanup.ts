import type { RegularCollectionId } from "metabase-types/api";

export type StaleItemsReadEvent = {
  event: "stale_items_read";
  collection_id: RegularCollectionId | null;
  total_stale_items_found: number;
  cutoff_date: string;
};

export type CleanupEvent = StaleItemsReadEvent;
