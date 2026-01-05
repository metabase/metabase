import { t } from "ttag";

import { GetCodeStep } from "./components/GetCodeStep";
import { SelectEmbedExperienceStep } from "./components/SelectEmbedExperienceStep";
import { SelectEmbedOptionsStep } from "./components/SelectEmbedOptionsStep";
import { SelectEmbedResourceStep } from "./components/SelectEmbedResourceStep";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupStep,
} from "./types";

/** The maximum number of recent items to show in the resource selection step. */
export const EMBED_RESOURCE_LIST_MAX_RECENTS = 6;

export const getEmbedExperiences = ({
  isMetabotAvailable,
}: {
  isMetabotAvailable: boolean;
}) =>
  [
    {
      value: "dashboard",
      title: t`Dashboard`,
      description: t`Embed an entire dashboard with multiple charts and filters`,
      supportsOss: true,
      supportsGuestEmbed: true,
    },
    {
      value: "chart",
      title: t`Chart`,
      description: t`Embed a single chart`,
      supportsOss: true,
      supportsGuestEmbed: true,
    },
    {
      value: "exploration",
      title: t`Exploration`,
      description: t`Embed an interactive data exploration experience`,
      supportsOss: false,
      supportsGuestEmbed: false,
    },
    {
      value: "browser",
      title: t`Browser`,
      description: t`Embed a browser to manage dashboards and charts`,
      supportsOss: false,
      supportsGuestEmbed: false,
    },
    ...(isMetabotAvailable
      ? [
          {
            value: "metabot" as const,
            title: t`Metabot`,
            description: t`Embed a Metabot chat interface`,
            supportsOss: false,
            supportsGuestEmbed: false,
          },
        ]
      : []),
  ] satisfies {
    title: string;
    description: string;
    value: SdkIframeEmbedSetupExperience;
    supportsOss: boolean;
    supportsGuestEmbed: boolean;
  }[];

type EmbedStepConfig = {
  id: SdkIframeEmbedSetupStep;
  component: React.ComponentType;
  skipFor?: SdkIframeEmbedSetupExperience[];
};

export const STEPS_WITHOUT_RESOURCE_SELECTION = [
  "exploration",
  "metabot",
] as const satisfies SdkIframeEmbedSetupExperience[];

export const EMBED_STEPS: EmbedStepConfig[] = [
  {
    id: "select-embed-experience",
    component: SelectEmbedExperienceStep,
  },
  {
    id: "select-embed-resource",
    component: SelectEmbedResourceStep,
    skipFor: STEPS_WITHOUT_RESOURCE_SELECTION,
  },
  {
    id: "select-embed-options",
    component: SelectEmbedOptionsStep,
  },
  {
    id: "get-code",
    component: GetCodeStep,
  },
];

/** If the activity log of the user is completely empty, we fallback to this dashboard. */
export const EMBED_FALLBACK_DASHBOARD_ID = 1;

/** If the activity log of the user is completely empty, we fallback to this question. */
export const EMBED_FALLBACK_QUESTION_ID = 1;

/**
 * How long to wait before we set the parameter value in the preview.
 *
 * Setting this too low will cause the preview to flicker as we need to re-render
 * the whole question or dashboard when the parameter changes.
 *
 * Setting this too high will cause the preview to feel unresponsive.
 **/
export const SET_INITIAL_PARAMETER_DEBOUNCE_MS = 500;

/**
 * How long to wait before we persist the user settings.
 *
 * Setting this too low will cause the settings to be saved too frequently,
 * causing unnecessary API calls and potential race condition.
 */
export const USER_SETTINGS_DEBOUNCE_MS = 800;
