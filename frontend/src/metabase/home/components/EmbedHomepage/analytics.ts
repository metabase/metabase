import { trackSchemaEvent } from "metabase/lib/analytics";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

import type { EmbeddingHomepageInitialTab } from "./types";

const SCHEMA_NAME = "embedding_homepage";

export const trackEmbeddingHomepageDismissed = (
  dismiss_reason: EmbeddingHomepageDismissReason,
) => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "embedding_homepage_dismissed",
    dismiss_reason,
  });
};

export const trackEmbeddingHomepageQuickstartClick = (
  initial_tab: EmbeddingHomepageInitialTab,
) => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "embedding_homepage_quickstart_click",
    initial_tab,
  });
};

export const trackEmbeddingHomepageExampleDashboardClick = (
  initial_tab: EmbeddingHomepageInitialTab,
) => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "embedding_homepage_example_dashboard_click",
    initial_tab,
  });
};
