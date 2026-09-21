import type {
  SdkIframeDashboardEmbedSettings,
  SdkIframeQuestionEmbedSettings,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "metabase/embedding/embedding-iframe-sdk-setup/types";

export const isQuestionOrDashboardSettings = (
  experience: SdkIframeEmbedSetupExperience,
  settings: SdkIframeEmbedSetupSettings,
): settings is
  | SdkIframeDashboardEmbedSettings
  | SdkIframeQuestionEmbedSettings =>
  (experience === "dashboard" &&
    settings.dashboardId !== null &&
    settings.dashboardId !== undefined) ||
  (experience === "chart" &&
    settings.questionId !== null &&
    settings.questionId !== undefined);
