import { pickBy } from "es-toolkit";
import { useCallback } from "react";
import { P, match } from "ts-pattern";

import { EMBED_FALLBACK_QUESTION_ID } from "metabase/embedding/embedding-iframe-sdk-setup/constants";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { determineDashboardId } from "metabase/embedding/embedding-iframe-sdk-setup/utils/determine-dashboard-id";
import { getDefaultSdkIframeEmbedSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-default-sdk-iframe-embed-setting";
import { ALLOWED_EMBED_SETTING_KEYS_MAP } from "metabase/embedding/embedding-iframe-sdk/constants";
import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/types";
import { useSetting } from "metabase/settings";

type PersistedKey = (typeof ALLOWED_EMBED_SETTING_KEYS_MAP.base)[number];

export const useHandleExperienceChange = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isGuestEmbedsEnabled,
    isSsoEnabledAndConfigured,
    isRecentsLoading,
    settings,
    replaceSettings,
    recentDashboards,
    recentQuestions,
  } = useSdkIframeEmbedSetupContext();

  const exampleDashboardId = useSetting("example-dashboard-id");

  const handleEmbedExperienceChange = useCallback(
    (experience: SdkIframeEmbedSetupExperience) => {
      const persistedKeys: readonly string[] =
        ALLOWED_EMBED_SETTING_KEYS_MAP.base;
      const persistedSettings: Partial<
        Pick<SdkIframeEmbedSetupSettings, Exclude<PersistedKey, "instanceUrl">>
      > = pickBy(settings, (_value, key) => persistedKeys.includes(key));

      // Use the most recent item for the selected type.
      // If the activity log is completely empty, use the fallback.
      const defaultResourceId = match(experience)
        .with(
          "chart",
          () => recentQuestions[0]?.id ?? EMBED_FALLBACK_QUESTION_ID,
        )
        .with("dashboard", () =>
          determineDashboardId({
            isRecentsLoading,
            recentDashboards,
            exampleDashboardId,
          }),
        )
        .with(P.union("exploration", "browser", "metabot"), () => 0) // resource id does not apply
        .exhaustive();

      replaceSettings({
        // these settings do not change when the embed type changes
        ...persistedSettings,

        // these settings are overridden when the embed type changes
        ...getDefaultSdkIframeEmbedSettings({
          experience,
          resourceId: defaultResourceId,
          isSimpleEmbedFeatureAvailable,
          isGuestEmbedsEnabled,
          isSsoEnabledAndConfigured,
          isGuest: !!settings.isGuest,
          useExistingUserSession: !!settings.useExistingUserSession,
        }),
      });
    },
    [
      isGuestEmbedsEnabled,
      isSsoEnabledAndConfigured,
      isSimpleEmbedFeatureAvailable,
      recentDashboards,
      isRecentsLoading,
      recentQuestions,
      replaceSettings,
      settings,
      exampleDashboardId,
    ],
  );

  return handleEmbedExperienceChange;
};
