import { P, match } from "ts-pattern";

import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  QuestionEmbedOptions,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "../types";

export const getDefaultSdkIframeEmbedSettings = (
  type: SdkIframeEmbedSetupExperience,
  defaultResourceId: string | number,
): SdkIframeEmbedSetupSettings => {
  const templateDefaults = match(type)
    .with(
      "dashboard",
      (): DashboardEmbedOptions => ({
        componentName: "metabase-dashboard",
        dashboardId: defaultResourceId,
        drills: true,
        withDownloads: false,
        withTitle: true,
      }),
    )
    .with(
      "chart",
      (): QuestionEmbedOptions => ({
        componentName: "metabase-question",
        questionId: defaultResourceId,
        drills: true,
        withDownloads: false,
        withTitle: true,
        isSaveEnabled: false,
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
    .exhaustive();

  return {
    ...templateDefaults,
    useExistingUserSession: true,
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
    // TODO(EMB-869): add Metabot experience to embed flow - replace this with "metabot"
    .with({ componentName: "metabase-metabot" }, () => "chart")
    .exhaustive();
