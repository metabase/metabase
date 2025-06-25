import { match } from "ts-pattern";

import type {
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  QuestionEmbedOptions,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type { SdkIframeEmbedSetupExperience } from "../types";

export const getDefaultSdkIframeEmbedSettings = (
  type: SdkIframeEmbedSetupExperience,
  defaultResourceId: string | number,
) =>
  match(type)
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

// TODO: will be replaced with the most recently visited dashboard once EMB-508 is merged.
export const DEFAULT_SDK_IFRAME_EMBED_SETTINGS =
  getDefaultSdkIframeEmbedSettings("dashboard", 1);
