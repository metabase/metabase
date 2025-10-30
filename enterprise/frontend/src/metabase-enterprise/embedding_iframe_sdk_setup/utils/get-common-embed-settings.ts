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
    experience === "dashboard" || experience === "chart";

  return {
    ...(isQuestionOrDashboardEmbed
      ? {
          isStatic: true,
          useExistingUserSession: false,
          drills: false,
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
    experience === "dashboard" || experience === "chart";

  return {
    ...(isQuestionOrDashboardEmbed
      ? {
          isStatic: false,
          useExistingUserSession: state?.useExistingUserSession,
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
}: {
  state:
    | Pick<SdkIframeEmbedSetupSettings, "isStatic" | "useExistingUserSession">
    | undefined;
  experience: SdkIframeEmbedSetupExperience;
}) => {
  return state?.isStatic
    ? GET_ENABLE_STATIC_EMBEDDING_SETTINGS({ experience })
    : GET_DISABLE_STATIC_EMBEDDING_SETTINGS({ state, experience });
};
