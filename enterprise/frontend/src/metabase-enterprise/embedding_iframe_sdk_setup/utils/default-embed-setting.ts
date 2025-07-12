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
        dashboardId: defaultResourceId,
        isDrillThroughEnabled: true,
        withDownloads: false,
        withTitle: true,
      }),
    )
    .with(
      "chart",
      (): QuestionEmbedOptions => ({
        questionId: defaultResourceId,
        isDrillThroughEnabled: true,
        withDownloads: false,
        withTitle: true,
      }),
    )
    .with(
      "exploration",
      (): ExplorationEmbedOptions => ({
        template: "exploration",
        isSaveEnabled: true,
      }),
    )
    .exhaustive();

  return {
    ...templateDefaults,
    useExistingUserSession: true,
  };
};
