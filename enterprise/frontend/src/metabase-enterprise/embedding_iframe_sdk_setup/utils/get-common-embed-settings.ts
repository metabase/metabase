import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";
import { isQuestionOrDashboardExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/is-question-or-dashboard-experience";

import type {
  SdkIframeDashboardEmbedSettings,
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
  SdkIframeEmbedSetupStaticEmbeddingSettings,
  SdkIframeQuestionEmbedSettings,
} from "../types";

const GET_ENABLE_STATIC_EMBEDDING_SETTINGS: (data: {
  experience: SdkIframeEmbedSetupExperience;
}) => SdkIframeEmbedSetupStaticEmbeddingSettings &
  Pick<SdkIframeEmbedSetupSettings, "useExistingUserSession"> = ({
  experience,
}) => {
  const isQuestionOrDashboardEmbed =
    isQuestionOrDashboardExperience(experience);

  return {
    ...(isQuestionOrDashboardEmbed
      ? {
          isStatic: true,
          useExistingUserSession: false,
          ...(isQuestionOrDashboardExperience(experience) && {
            drills: false,
          }),
        }
      : {
          isStatic: false,
          useExistingUserSession: true,
        }),
  };
};

const GET_DISABLE_STATIC_EMBEDDING_SETTINGS: (data: {
  state:
    | Pick<SdkIframeEmbedSetupSettings, "isStatic" | "useExistingUserSession">
    | undefined;
  experience: SdkIframeEmbedSetupExperience;
}) => SdkIframeEmbedSetupStaticEmbeddingSettings &
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
          isStatic: false,
          useExistingUserSession: state?.useExistingUserSession,
          drills: true,
          lockedParameters: [],
        }
      : {
          isStatic: false,
          useExistingUserSession: state?.useExistingUserSession,
        }),
  };
};

export const getCommonEmbedSettings = ({
  state,
  experience,
  isStaticEmbeddingEnabled,
}: {
  state:
    | Pick<SdkIframeEmbedSetupSettings, "isStatic" | "useExistingUserSession">
    | undefined;
  experience: SdkIframeEmbedSetupExperience;
  isStaticEmbeddingEnabled: boolean;
}) => {
  const isSimpleEmbedFeatureAvailable =
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isFeatureEnabled();

  if (isSimpleEmbedFeatureAvailable) {
    return isStaticEmbeddingEnabled && state?.isStatic
      ? GET_ENABLE_STATIC_EMBEDDING_SETTINGS({ experience })
      : GET_DISABLE_STATIC_EMBEDDING_SETTINGS({ state, experience });
  } else {
    return GET_ENABLE_STATIC_EMBEDDING_SETTINGS({ experience });
  }
};
