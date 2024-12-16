import { trackSchemaEvent } from "metabase/lib/analytics";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

const SCHEMA_NAME = "embedding_homepage";

export const trackEmbeddingHomepageDismissed = (
  dismiss_reason: EmbeddingHomepageDismissReason,
) => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "embedding_homepage_dismissed",
    dismiss_reason,
  });
};

export const trackEmbeddingHomepageExampleDashboardClick = () => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "embedding_homepage_example_dashboard_click",
  });
};
