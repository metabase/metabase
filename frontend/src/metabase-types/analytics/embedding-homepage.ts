export type EmbeddingHomepageDismissedEvent = {
  event: "embedding_homepage_dismissed";
  dismiss_reason:
    | "dismissed-done"
    | "dismissed-run-into-issues"
    | "dismissed-not-interested-now";
};

export type EmbeddingHomepageQuickstartClickEvent = {
  event: "embedding_homepage_quickstart_click";
  initial_tab: "static" | "interactive";
};

export type EmbeddingHomepageExampleDashboardClickEvent = {
  event: "embedding_homepage_example_dashboard_click";
  initial_tab: "static" | "interactive";
};

export type EmbeddingHomepageEvent =
  | EmbeddingHomepageDismissedEvent
  | EmbeddingHomepageQuickstartClickEvent
  | EmbeddingHomepageExampleDashboardClickEvent;
