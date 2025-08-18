import { match } from "ts-pattern";

import type {
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  QuestionEmbedOptions,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "../types";

export const getDefaultSdkIframeEmbedSettings = (
  type: SdkIframeEmbedSetupExperience,
  defaultResourceId: string | number,
): SdkIframeEmbedSetupSettings => {
  const templateDefaults = match(type)
    .with(
      "dashboard",
      (): DashboardEmbedOptions => ({
        componentName: "metabase-dashboard",
        dashboardId: defaultResourceId,
        drills: true,
        withDownloads: false,
        withTitle: true,
      }),
    )
    .with(
      "chart",
      (): QuestionEmbedOptions => ({
        componentName: "metabase-question",
        questionId: defaultResourceId,
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
    .exhaustive();

  return {
    ...templateDefaults,
    useExistingUserSession: true,
  };
};
