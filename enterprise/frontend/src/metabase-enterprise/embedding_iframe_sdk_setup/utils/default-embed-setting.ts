import { match } from "ts-pattern";

import type {
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  QuestionEmbedOptions,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type { SdkIframeEmbedSetupType } from "../types";

export const getDefaultSdkIframeEmbedSettings = (
  type: SdkIframeEmbedSetupType,
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
