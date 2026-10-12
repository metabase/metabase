import { match } from "ts-pattern";

import type { SdkIframeEmbedSetupSettings } from "../types";

export type BehaviorDocsParams = { page: string } | null;

export const getBehaviorDocsUrlParams = (
  settings: SdkIframeEmbedSetupSettings,
): BehaviorDocsParams => {
  if (settings.isGuest) {
    return { page: "embedding/guest-embedding" };
  }

  // Each component's attributes are documented on its own reference page, where
  // they're the first section.
  const page = match(settings.componentName)
    .with("metabase-browser", () => "embedding/browser-reference")
    .with("metabase-question", () => "embedding/question-reference")
    .with("metabase-dashboard", () => "embedding/dashboard-reference")
    .otherwise(() => null);

  if (!page) {
    return null;
  }

  return { page };
};
