import { P, match } from "ts-pattern";

import type { SdkDashboardId, SdkQuestionId } from "embedding-sdk-bundle/types";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import type {
  BrowserEmbedOptions,
  DashboardEmbedOptions,
  ExplorationEmbedOptions,
  MetabotEmbedOptions,
  QuestionEmbedOptions,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";

import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "../types";

import { getCommonEmbedSettings } from "./get-common-embed-settings";

export const getDefaultSdkIframeEmbedSettings = ({
  initialState,
  experience,
  resourceId,
  isStaticEmbeddingEnabled,
}: {
  initialState: SdkIframeEmbedSetupModalInitialState | undefined;
  experience: SdkIframeEmbedSetupExperience;
  resourceId: SdkDashboardId | SdkQuestionId;
  isStaticEmbeddingEnabled: boolean;
}): SdkIframeEmbedSetupSettings => {
  const defaults = match(experience)
    .with(
      "dashboard",
      (): DashboardEmbedOptions => ({
        componentName: "metabase-dashboard",
        dashboardId: resourceId,
        drills: true,
        withDownloads: false,
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
    .with(
      "metabot",
      (): MetabotEmbedOptions => ({
        componentName: "metabase-metabot",
      }),
    )
    .exhaustive();

  return {
    useExistingUserSession: true,
    ...defaults,
    ...getCommonEmbedSettings({
      state: initialState,
      experience,
      isStaticEmbeddingEnabled,
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
