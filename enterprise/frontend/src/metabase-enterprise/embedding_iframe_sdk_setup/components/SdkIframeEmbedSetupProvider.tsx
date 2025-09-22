import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-use";
import { P, match } from "ts-pattern";
import _ from "underscore";

import { useSearchQuery } from "metabase/api";
import { useUserSetting } from "metabase/common/hooks";

import { trackEmbedWizardSettingsUpdated } from "../analytics";
import {
  EMBED_FALLBACK_DASHBOARD_ID,
  USER_SETTINGS_DEBOUNCE_MS,
} from "../constants";
import {
  SdkIframeEmbedSetupContext,
  type SdkIframeEmbedSetupContextType,
} from "../context";
import { useParameterList, useRecentItems } from "../hooks";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
  SdkIframeEmbedSetupStartWith,
  SdkIframeEmbedSetupStep,
} from "../types";
import { getDefaultSdkIframeEmbedSettings } from "../utils/default-embed-setting";

interface SdkIframeEmbedSetupProviderProps {
  children: ReactNode;
  startWith?: SdkIframeEmbedSetupStartWith;
}

export const SdkIframeEmbedSetupProvider = ({
  children,
  startWith,
}: SdkIframeEmbedSetupProviderProps) => {
  const location = useLocation();
  const [isEmbedSettingsLoaded, setEmbedSettingsLoaded] = useState(false);

  const embeddingType = startWith?.embeddingType ?? "modular";
  const isStaticEmbedding = embeddingType === "static";

  const [rawSettings, setRawSettings] = useState<SdkIframeEmbedSetupSettings>();

  const [persistedSettings, persistSettings] = usePersistedSettings({
    isStaticEmbedding,
  });

  // We don't want to re-fetch the recent items every time we switch between
  // steps, therefore we load recent items once in the provider.
  const {
    recentDashboards,
    recentQuestions,
    recentCollections,
    addRecentItem,
    isRecentsLoading,
  } = useRecentItems();

  const { data: searchData } = useSearchQuery({
    limit: 0,
    models: ["dataset"],
  });

  const modelCount = searchData?.total ?? 0;

  // EmbeddingHub passes `auth_method`.
  // EmbedContentModal passes `resource_type` and `resource_id`.
  const urlParams = useMemo(() => {
    const params = new URLSearchParams(location.search);

    return {
      authMethod: params.get("auth_method"),
      resourceType: params.get("resource_type"),
      resourceId: params.get("resource_id"),
    };
  }, [location.search]);

  const defaultSettings = useMemo(() => {
    if (startWith) {
      return getDefaultSdkIframeEmbedSettings(startWith);
    }

    return match([urlParams.resourceType, urlParams.resourceId])
      .with(["dashboard", P.nonNullable], ([, id]) =>
        getDefaultSdkIframeEmbedSettings({
          embeddingType: "modular",
          resourceType: "dashboard",
          resourceId: id,
        }),
      )
      .with(["question", P.nonNullable], ([, id]) =>
        getDefaultSdkIframeEmbedSettings({
          embeddingType: "modular",
          resourceType: "chart",
          resourceId: id,
        }),
      )
      .otherwise(() =>
        getDefaultSdkIframeEmbedSettings({
          embeddingType: "modular",
          resourceType: "dashboard",
          resourceId: recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID,
        }),
      );
  }, [startWith, recentDashboards, urlParams]);

  // Default to the embed options step if both resource type and id are provided.
  // This is to skip the experience and resource selection steps as we know both.
  const defaultStep: SdkIframeEmbedSetupStep = useMemo(() => {
    if (startWith?.step) {
      return startWith?.step;
    }

    if (urlParams.resourceType !== null && urlParams.resourceId !== null) {
      return "select-embed-options";
    }

    return "select-embed-experience";
  }, [startWith, urlParams]);

  const [currentStep, setCurrentStep] =
    useState<SdkIframeEmbedSetupStep>(defaultStep);

  const settings = useMemo(() => {
    const latestSettings = rawSettings ?? defaultSettings;

    // Append entity-types=model if there are more than 2 models in the instance.
    if (modelCount > 2) {
      return match(latestSettings)
        .with({ componentName: "metabase-question" }, (settings) => ({
          ...settings,
          entityTypes: ["model" as const],
        }))
        .with({ componentName: "metabase-browser" }, (settings) => ({
          ...settings,
          dataPickerEntityTypes: ["model" as const],
        }))
        .otherwise((settings) => settings);
    }

    return latestSettings;
  }, [defaultSettings, modelCount, rawSettings]);

  // Which embed experience are we setting up?
  const experience = useMemo(
    () =>
      match<SdkIframeEmbedSetupSettings, SdkIframeEmbedSetupExperience>(
        settings,
      )
        .with({ template: "exploration" }, () => "exploration")
        .with({ componentName: "metabase-question" }, () => "chart")
        .with({ componentName: "metabase-browser" }, () => "browser")
        .with({ componentName: "metabase-dashboard" }, () => "dashboard")
        .exhaustive(),
    [settings],
  );

  // Use parameter list hook for dynamic parameter loading
  const { availableParameters, isLoadingParameters } = useParameterList({
    experience,

    // We're always using numeric IDs for previews.
    ...(settings.dashboardId && {
      dashboardId: settings.dashboardId as number,
    }),

    ...(settings.questionId && {
      questionId: Number(settings.questionId),
    }),
  });

  const updateSettings = useCallback(
    (nextSettings: Partial<SdkIframeEmbedSetupSettings>) =>
      setRawSettings((prev) => {
        trackEmbedWizardSettingsUpdated(nextSettings);

        // Merging with a partial setting requires us to cast the type
        const mergedSettings = {
          ...(prev ?? defaultSettings),
          ...nextSettings,
        } as SdkIframeEmbedSetupSettings;

        persistSettings(mergedSettings);

        return mergedSettings;
      }),
    [defaultSettings, persistSettings],
  );

  const replaceSettings = useCallback(
    (nextSettings: SdkIframeEmbedSetupSettings) => {
      setRawSettings(nextSettings);
      persistSettings(nextSettings);
    },
    [persistSettings],
  );

  const value: SdkIframeEmbedSetupContextType = {
    startWith,
    embeddingType,
    currentStep,
    setCurrentStep,
    experience,
    settings,
    replaceSettings,
    updateSettings,
    recentDashboards,
    recentQuestions,
    recentCollections,
    addRecentItem,
    isEmbedSettingsLoaded,
    isLoadingParameters,
    availableParameters,
  };

  // Once the persisted settings are loaded, check if they are valid.
  // If they are, set them as the current settings.
  useEffect(() => {
    if (!isEmbedSettingsLoaded && !isRecentsLoading) {
      setRawSettings({
        ...settings,
        ...persistedSettings,

        // Override the persisted settings if `auth_method` is specified.
        // This is used for Embedding Hub.
        ...(urlParams.authMethod !== null && {
          useExistingUserSession: urlParams.authMethod === "user_session",
        }),
      });

      setEmbedSettingsLoaded(true);
    }
  }, [
    isStaticEmbedding,
    persistedSettings,
    isEmbedSettingsLoaded,
    settings,
    isRecentsLoading,
    urlParams,
  ]);

  return (
    <SdkIframeEmbedSetupContext.Provider value={value}>
      {children}
    </SdkIframeEmbedSetupContext.Provider>
  );
};

const getSettingsToPersist = (
  settings: Partial<SdkIframeEmbedSetupSettings>,
  isStaticEmbedding: boolean,
) => {
  const keys: (keyof Pick<
    SdkIframeEmbedSetupSettings,
    "theme" | "useExistingUserSession"
  >)[] = ["theme"];

  // Don't persist it for static embedding, because it is always `false` in that case.
  if (!isStaticEmbedding) {
    keys.push("useExistingUserSession");
  }

  return _.pick(settings, keys);
};

const usePersistedSettings = ({
  isStaticEmbedding,
}: {
  isStaticEmbedding: boolean;
}) => {
  const [rawPersisted, rawPersistSettings] = useUserSetting(
    "sdk-iframe-embed-setup-settings",
    { debounceTimeout: USER_SETTINGS_DEBOUNCE_MS },
  );

  const persistedSettings = useMemo(
    () => getSettingsToPersist(rawPersisted || {}, isStaticEmbedding),
    [isStaticEmbedding, rawPersisted],
  );

  const persistSettings = useCallback(
    (settings: Partial<SdkIframeEmbedSetupSettings>) => {
      // TODO: it causes an additional loader after the `persist` request. Figure out why it happens.
      if (isStaticEmbedding) {
        return;
      }

      rawPersistSettings(getSettingsToPersist(settings, isStaticEmbedding));
    },
    [isStaticEmbedding, rawPersistSettings],
  );

  return [persistedSettings, persistSettings] as const;
};
