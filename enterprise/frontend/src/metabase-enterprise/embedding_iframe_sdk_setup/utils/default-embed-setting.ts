import { match } from "ts-pattern";

import type {
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  QuestionEmbedOptions,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type { SdkIframeEmbedSetupExperience } from "../types";

export const getDefaultSdkIframeEmbedSettings = (
  type: SdkIframeEmbedSetupExperience,
  defaultEntityId: string | number,
) =>
  match(type)
    .with(
      "dashboard",
      (): DashboardEmbedOptions => ({
        dashboardId: defaultEntityId,
        isDrillThroughEnabled: true,
        withDownloads: false,
        withTitle: true,
      }),
    )
    .with(
      "chart",
      (): QuestionEmbedOptions => ({
        questionId: defaultEntityId,
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
