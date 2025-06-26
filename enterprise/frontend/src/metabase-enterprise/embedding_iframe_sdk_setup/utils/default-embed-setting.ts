import { match } from "ts-pattern";

import type { SdkIframeEmbedSetupExperience } from "../types";

export const getDefaultSdkIframeEmbedSettings = (
  type: SdkIframeEmbedSetupExperience,
  defaultEntityId: string | number,
) =>
  match(type)
    .with("dashboard", () => ({
      dashboardId: defaultEntityId,
      isDrillThroughEnabled: true,
      withDownloads: false,
      withTitle: true,
    }))
    .with("chart", () => ({
      questionId: defaultEntityId,
      isDrillThroughEnabled: true,
      withDownloads: false,
      withTitle: true,
    }))
    .with("exploration", () => ({
      template: "exploration",
      isSaveEnabled: true,
    }))
    .exhaustive();
