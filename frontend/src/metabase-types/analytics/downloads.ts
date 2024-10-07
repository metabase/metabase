type DownloadsEventSchema = {
  event: string;
  resource_type?: string | null;
  accessed_via?: string | null;
  export_type?: string | null;
};

type ValidateEvent<
  T extends DownloadsEventSchema &
    Record<Exclude<keyof T, keyof DownloadsEventSchema>, never>,
> = T;

export type DownloadResultsClickedEvent = ValidateEvent<{
  event: "download_results_clicked";
  resource_type: "question" | "dashcard" | "ad-hoc-question";
  accessed_via:
    | "internal"
    | "public-link"
    | "static-embed"
    | "interactive-iframe-embed"
    | "sdk-embed";
  export_type: "csv" | "xlsx" | "json" | "png";
}>;

export type DownloadsEvent = DownloadResultsClickedEvent;
