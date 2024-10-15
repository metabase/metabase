type CleanupEventSchema = {
  event: string;
  collection_id?: number | null;
  total_stale_items_found?: number | null;
  total_items_archived?: number | null;
  cutoff_date?: string | null;
};

type ValidateEvent<
  T extends CleanupEventSchema &
    Record<Exclude<keyof T, keyof CleanupEventSchema>, never>,
> = T;

export type StaleItemsReadEvent = ValidateEvent<{
  event: "stale_items_read";
  collection_id: number | null;
  total_stale_items_found: number;
  cutoff_date: string;
}>;

export type StaleItemsArchivedEvent = ValidateEvent<{
  event: "stale_items_archived";
  collection_id: number | null;
  total_items_archived: number;
  cutoff_date: string;
}>;

export type CleanupEvent = StaleItemsReadEvent | StaleItemsArchivedEvent;
