import { trackSchemaEvent } from "metabase/lib/analytics";

import type { EmbedHomepageDismissReason, InitialTab } from "./types";

const SCHEMA_NAME = "embedding_homepage";
const SCHEMA_VERSION = "1-0-0";

export const trackEmbeddingHomepageDismissed = (
  dismiss_reason: EmbedHomepageDismissReason,
) => {
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
    event: "embedding_homepage_dismissed",
    dismiss_reason,
  });
};

export const trackEmbeddingHomepageQuickstartClick = (
  initial_tab: InitialTab,
) => {
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
    event: "embedding_homepage_quickstart_click",
    initial_tab,
  });
};

export const trackEmbeddingHomepageExampleDashboardClick = (
  initial_tab: InitialTab,
) => {
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
    event: "embedding_homepage_example_dashboard_click",
    initial_tab,
  });
};
