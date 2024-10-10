import { trackSchemaEvent } from "metabase/lib/analytics";
import type { RegularCollectionId } from "metabase-types/api";

export const trackStaleItemsArchived = ({
  collection_id,
  total_stale_items_found,
  cutoff_date,
}: {
  collection_id: RegularCollectionId | null;
  total_stale_items_found: number;
  cutoff_date: string;
}) => {
  trackSchemaEvent("cleanup", {
    event: "stale_items_archived",
    collection_id,
    total_stale_items_found,
    cutoff_date,
  });
};
