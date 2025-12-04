import { isQuestionOrDashboardExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-question-or-dashboard-experience";
import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";

import type {
  SdkIframeDashboardEmbedSettings,
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupGuestEmbedSettings,
  SdkIframeEmbedSetupSettings,
  SdkIframeQuestionEmbedSettings,
} from "../types";

const GET_ENABLE_GUEST_EMBED_SETTINGS: (data: {
  isSimpleEmbedFeatureAvailable: boolean;
  experience: SdkIframeEmbedSetupExperience;
}) => SdkIframeEmbedSetupGuestEmbedSettings &
  Pick<SdkIframeEmbedSetupSettings, "useExistingUserSession"> = ({
  isSimpleEmbedFeatureAvailable,
  experience,
}) => {
  const isQuestionOrDashboardEmbed =
    isQuestionOrDashboardExperience(experience);

  return {
    ...(isQuestionOrDashboardEmbed
      ? {
          isGuest: true,
          isSso: false,
          useExistingUserSession: false,
          ...(isQuestionOrDashboardEmbed && {
            drills: false,
            // We force set `downloads` to `true` when the `simple embedding` feature is not enabled (OSS)
            ...(!isSimpleEmbedFeatureAvailable && {
              withDownloads: true,
            }),
          }),
        }
      : {
          isGuest: false,
          isSso: true,
          useExistingUserSession: true,
        }),
    hiddenParameters: [],
  };
};

const GET_DISABLE_GUEST_EMBED_SETTINGS: (data: {
  state:
    | Pick<SdkIframeEmbedSetupSettings, "isGuest" | "useExistingUserSession">
    | undefined;
  experience: SdkIframeEmbedSetupExperience;
  isSsoEnabledAndConfigured: boolean;
}) => SdkIframeEmbedSetupGuestEmbedSettings &
  Pick<SdkIframeEmbedSetupSettings, "useExistingUserSession"> &
  Pick<
    SdkIframeDashboardEmbedSettings | SdkIframeQuestionEmbedSettings,
    "lockedParameters"
  > = ({ state, experience, isSsoEnabledAndConfigured }) => {
  const isQuestionOrDashboardEmbed =
    isQuestionOrDashboardExperience(experience);
  const isQuestionEmbed = experience === "chart";

  return {
    ...(isQuestionOrDashboardEmbed
      ? {
          isGuest: false,
          isSso: true,
          useExistingUserSession:
            !isSsoEnabledAndConfigured || state?.useExistingUserSession,
          drills: true,
        }
      : {
          isGuest: false,
          isSso: true,
          useExistingUserSession:
            !isSsoEnabledAndConfigured || state?.useExistingUserSession,
        }),
    ...(isQuestionEmbed && {
      // Currently, a chart should not have hidden parameters in non-guest embed mode
      hiddenParameters: [],
    }),
  };
};

export const getCommonEmbedSettings = ({
  state,
  experience,
  isGuestEmbedsEnabled,
  isSsoEnabledAndConfigured,
}: {
  state:
    | Pick<SdkIframeEmbedSetupSettings, "isGuest" | "useExistingUserSession">
    | undefined;
  experience: SdkIframeEmbedSetupExperience;
  isGuestEmbedsEnabled: boolean;
  isSsoEnabledAndConfigured: boolean;
}) => {
  const isSimpleEmbedFeatureAvailable =
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled();

  if (isSimpleEmbedFeatureAvailable) {
    return isGuestEmbedsEnabled && state?.isGuest
      ? GET_ENABLE_GUEST_EMBED_SETTINGS({
          experience,
          isSimpleEmbedFeatureAvailable,
        })
      : GET_DISABLE_GUEST_EMBED_SETTINGS({
          state,
          experience,
          isSsoEnabledAndConfigured,
        });
  } else {
    return GET_ENABLE_GUEST_EMBED_SETTINGS({
      experience,
      isSimpleEmbedFeatureAvailable,
    });
  }
};
