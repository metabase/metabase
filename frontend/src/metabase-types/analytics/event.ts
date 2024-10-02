type SimpleEventSchema = {
  event: string;
  target_id?: number | null;
  triggered_from?: string | null;
  duration_ms?: number | null;
  result?: string | null;
  event_detail?: string | null;
};

type ValidateEvent<
  T extends SimpleEventSchema &
    Record<Exclude<keyof T, keyof SimpleEventSchema>, never>,
> = T;

export type CsvUploadClickedEvent = ValidateEvent<{
  event: "csv_upload_clicked";
  triggered_from: "left_nav";
}>;

export type NewsletterToggleClickedEvent = ValidateEvent<{
  event: "newsletter-toggle-clicked";
  triggered_from: "setup";
  event_detail: "opted-in" | "opted-out";
}>;

export type EmbeddingSdkElementLoaded = ValidateEvent<{
  event: "embedding-sdk-element-loaded";
  triggered_from: "embedding-sdk";
  event_detail: string;
}>;

export type SimpleEvent =
  | CsvUploadClickedEvent
  | NewsletterToggleClickedEvent
  | EmbeddingSdkElementLoaded;
