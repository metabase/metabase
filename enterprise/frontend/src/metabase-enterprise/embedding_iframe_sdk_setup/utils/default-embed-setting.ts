import { match } from "ts-pattern";

import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  QuestionEmbedOptions,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type {
  SdkIframeEmbedSetupSettings,
  SdkIframeEmbedSetupStartWith,
} from "../types";

export const getDefaultSdkIframeEmbedSettings = ({
  embeddingType,
  resourceType,
  resourceId,
}: Omit<SdkIframeEmbedSetupStartWith, "step">): SdkIframeEmbedSetupSettings => {
  const isStaticEmbedding = embeddingType === "static";

  const templateDefaults = match(resourceType)
    .with(
      "dashboard",
      (): DashboardEmbedOptions => ({
        componentName: "metabase-dashboard",
        dashboardId: resourceId,
        drills: !isStaticEmbedding,
        withDownloads: false,
        withTitle: true,
      }),
    )
    .with(
      "chart",
      (): QuestionEmbedOptions => ({
        componentName: "metabase-question",
        questionId: resourceId,
        drills: !isStaticEmbedding,
        withDownloads: false,
        withTitle: true,
        isSaveEnabled: false,
      }),
    )
    .with(
      "exploration",
      (): ExplorationEmbedOptions => ({
        componentName: "metabase-question",
        template: "exploration",
        isSaveEnabled: false,
      }),
    )
    .with(
      "browser",
      (): BrowserEmbedOptions => ({
        componentName: "metabase-browser",
        initialCollection: "root",
        readOnly: true,
      }),
    )
    .exhaustive();

  return {
    ...templateDefaults,
    useExistingUserSession: !isStaticEmbedding,
  };
};
