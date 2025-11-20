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
  experience: SdkIframeEmbedSetupExperience;
}) => SdkIframeEmbedSetupGuestEmbedSettings &
  Pick<SdkIframeEmbedSetupSettings, "useExistingUserSession"> = ({
  experience,
}) => {
  const isQuestionOrDashboardEmbed =
    isQuestionOrDashboardExperience(experience);

  return {
    ...(isQuestionOrDashboardEmbed
      ? {
          isGuestEmbed: true,
          useExistingUserSession: false,
          ...(isQuestionOrDashboardExperience(experience) && {
            drills: false,
          }),
        }
      : {
          isGuestEmbed: false,
          useExistingUserSession: true,
        }),
  };
};

const GET_DISABLE_GUEST_EMBED_SETTINGS: (data: {
  state:
    | Pick<
        SdkIframeEmbedSetupSettings,
        "isGuestEmbed" | "useExistingUserSession"
      >
    | undefined;
  experience: SdkIframeEmbedSetupExperience;
}) => SdkIframeEmbedSetupGuestEmbedSettings &
  Pick<SdkIframeEmbedSetupSettings, "useExistingUserSession"> &
  Pick<
    SdkIframeDashboardEmbedSettings | SdkIframeQuestionEmbedSettings,
    "lockedParameters"
  > = ({ state, experience }) => {
  const isQuestionOrDashboardEmbed =
    isQuestionOrDashboardExperience(experience);

  return {
    ...(isQuestionOrDashboardEmbed
      ? {
          isGuestEmbed: false,
          useExistingUserSession: state?.useExistingUserSession,
          drills: true,
          lockedParameters: [],
        }
      : {
          isGuestEmbed: false,
          useExistingUserSession: state?.useExistingUserSession,
        }),
  };
};

export const getCommonEmbedSettings = ({
  state,
  experience,
  isGuestEmbedsEnabled,
}: {
  state:
    | Pick<
        SdkIframeEmbedSetupSettings,
        "isGuestEmbed" | "useExistingUserSession"
      >
    | undefined;
  experience: SdkIframeEmbedSetupExperience;
  isGuestEmbedsEnabled: boolean;
}) => {
  const isSimpleEmbedFeatureAvailable =
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isFeatureEnabled();

  if (isSimpleEmbedFeatureAvailable) {
    return isGuestEmbedsEnabled && state?.isGuestEmbed
      ? GET_ENABLE_GUEST_EMBED_SETTINGS({ experience })
      : GET_DISABLE_GUEST_EMBED_SETTINGS({ state, experience });
  } else {
    return GET_ENABLE_GUEST_EMBED_SETTINGS({ experience });
  }
};
