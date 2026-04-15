import { P, match } from "ts-pattern";

import type { SdkDashboardId, SdkQuestionId } from "embedding-sdk-bundle/types";
import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  MetabotEmbedOptions,
  QuestionEmbedOptions,
  SdkIframeEmbedBaseSettings,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "../types";

import { getCommonEmbedSettings } from "./get-common-embed-settings";

export const getDefaultSdkIframeEmbedSettings = ({
  experience,
  resourceId,
  isSimpleEmbedFeatureAvailable,
  isGuestEmbedsEnabled,
  isSsoEnabledAndConfigured,
  isGuest,
  useExistingUserSession,
}: {
  experience: SdkIframeEmbedSetupExperience;
  resourceId: SdkDashboardId | SdkQuestionId | null;
  isSimpleEmbedFeatureAvailable: boolean;
  isGuestEmbedsEnabled: boolean;
  isSsoEnabledAndConfigured: boolean;
  isGuest: boolean;
  useExistingUserSession: boolean;
}): SdkIframeEmbedSetupSettings => {
  const baseSettingsDefaults: Partial<SdkIframeEmbedBaseSettings> = {
    useExistingUserSession: true,
    // When `simple embed` feature is not available, we allow to set only a theme preset, so we default it to `light`
    ...(!isSimpleEmbedFeatureAvailable && {
      theme: { preset: "light" },
    }),
  };

  const experienceSettingsDefaults = match(experience)
    .with(
      "dashboard",
      (): DashboardEmbedOptions => ({
        componentName: "metabase-dashboard",
        dashboardId: resourceId,
        drills: true,
        withDownloads: false,
        withSubscriptions: false,
        withTitle: true,
      }),
    )
    .with(
      "chart",
      (): QuestionEmbedOptions => ({
        componentName: "metabase-question",
        questionId: resourceId,
        drills: true,
        withDownloads: false,
        withAlerts: false,
        withTitle: true,
        isSaveEnabled: false,
        initialSqlParameters: {},
      }),
    )
    .with(
      "exploration",
      (): ExplorationEmbedOptions => ({
        componentName: "metabase-question",
        template: "exploration",
        isSaveEnabled: false,
      }),
    )
    .with(
      "browser",
      (): BrowserEmbedOptions => ({
        componentName: "metabase-browser",
        initialCollection: "root",
        readOnly: true,
      }),
    )
    .with(
      "metabot",
      (): MetabotEmbedOptions => ({
        componentName: "metabase-metabot",
      }),
    )
    .exhaustive();

  return {
    ...baseSettingsDefaults,
    ...experienceSettingsDefaults,
    ...getCommonEmbedSettings({
      experience,
      isGuestEmbedsEnabled,
      isSsoEnabledAndConfigured,
      isGuest,
      useExistingUserSession,
    }),
  };
};

export const getResourceIdFromSettings = (
  settings: SdkIframeEmbedSetupSettings,
): string | number | undefined =>
  match(settings)
    .with({ initialCollection: P.nonNullable }, (s) => s.initialCollection)
    .with({ dashboardId: P.nonNullable }, (s) => s.dashboardId)
    .with({ questionId: P.nonNullable }, (s) => s.questionId)
    .otherwise(() => undefined);

export const getExperienceFromSettings = (
  settings: SdkIframeEmbedSetupSettings,
): SdkIframeEmbedSetupExperience =>
  match<SdkIframeEmbedSetupSettings, SdkIframeEmbedSetupExperience>(settings)
    .with({ template: "exploration" }, () => "exploration")
    .with({ componentName: "metabase-question" }, () => "chart")
    .with({ componentName: "metabase-browser" }, () => "browser")
    .with({ componentName: "metabase-dashboard" }, () => "dashboard")
    .with({ componentName: "metabase-metabot" }, () => "metabot")
    .exhaustive();
