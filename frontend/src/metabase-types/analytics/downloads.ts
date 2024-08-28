export type DownloadResultsClickedEvent = {
  event: "download_results_clicked";
  resource_type: "question" | "dashcard" | "ad-hoc-question";
  accessed_via:
    | "internal"
    | "public-link"
    | "static-embed"
    | "interactive-iframe-embed"
    | "sdk-embed";
  export_type: "csv" | "xlsx" | "json" | "png";
};

export type DownloadsEvent = DownloadResultsClickedEvent;
