import { match } from "ts-pattern";

import type { SdkDashboardId, SdkQuestionId } from "embedding-sdk-bundle/types";
import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  QuestionEmbedOptions,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "../types";

export const getDefaultSdkIframeEmbedSettings = ({
  experience,
  resourceId,
}: {
  experience: SdkIframeEmbedSetupExperience;
  resourceId: SdkDashboardId | SdkQuestionId;
}): SdkIframeEmbedSetupSettings => {
  const templateDefaults = match(experience)
    .with(
      "dashboard",
      (): DashboardEmbedOptions => ({
        componentName: "metabase-dashboard",
        dashboardId: resourceId,
        drills: true,
        withDownloads: false,
        withTitle: true,
      }),
    )
    .with(
      "chart",
      (): QuestionEmbedOptions => ({
        componentName: "metabase-question",
        questionId: resourceId,
        drills: true,
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
    useExistingUserSession: true,
  };
};
