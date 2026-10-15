import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type {
  SdkIframeDashboardEmbedSettings,
  SdkIframeQuestionEmbedSettings,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";
import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/types";

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
