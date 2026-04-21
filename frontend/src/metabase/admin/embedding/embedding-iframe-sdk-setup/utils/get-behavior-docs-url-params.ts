import { match } from "ts-pattern";

import type { SdkIframeEmbedSetupSettings } from "../types";

export type BehaviorDocsParams = { page: string; anchor?: string } | null;

export const getBehaviorDocsUrlParams = (
  settings: SdkIframeEmbedSetupSettings,
): BehaviorDocsParams => {
  if (settings.isGuest) {
    return { page: "embedding/guest-embedding" };
  }

  const anchor = match(settings.componentName)
    .with("metabase-question", () => "question")
    .with("metabase-dashboard", () => "dashboard")
    .with("metabase-browser", () => "browser")
    .otherwise(() => null);

  if (!anchor) {
    return null;
  }

  return { page: "embedding/components", anchor };
};
