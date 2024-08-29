type EmbeddingHomepageEventSchema = {
  event: string;
  dismiss_reason?: string | null;
  initial_tab?: string | null;
};

type ValidateEvent<
  T extends EmbeddingHomepageEventSchema &
    Record<Exclude<keyof T, keyof EmbeddingHomepageEventSchema>, never>,
> = T;

export type EmbeddingHomepageDismissedEvent = ValidateEvent<{
  event: "embedding_homepage_dismissed";
  dismiss_reason:
    | "dismissed-done"
    | "dismissed-run-into-issues"
    | "dismissed-not-interested-now";
}>;

export type EmbeddingHomepageQuickstartClickEvent = ValidateEvent<{
  event: "embedding_homepage_quickstart_click";
  initial_tab: "static" | "interactive";
}>;

export type EmbeddingHomepageExampleDashboardClickEvent = ValidateEvent<{
  event: "embedding_homepage_example_dashboard_click";
  initial_tab: "static" | "interactive";
}>;

export type EmbeddingHomepageEvent =
  | EmbeddingHomepageDismissedEvent
  | EmbeddingHomepageQuickstartClickEvent
  | EmbeddingHomepageExampleDashboardClickEvent;
