import { trackSchemaEvent } from "metabase/lib/analytics";
import type { RegularCollectionId } from "metabase-types/api";

export const trackStaleItemsArchived = ({
  collection_id,
  total_items_archived,
  cutoff_date,
}: {
  collection_id: RegularCollectionId | null;
  total_items_archived: number;
  cutoff_date: string;
}) => {
  trackSchemaEvent("cleanup", {
    event: "stale_items_archived",
    collection_id,
    total_items_archived,
    cutoff_date,
  });
};
