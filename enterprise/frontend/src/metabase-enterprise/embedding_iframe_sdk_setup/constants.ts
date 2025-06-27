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

export const EMBED_EXPERIENCES = [
  {
    value: "dashboard" as SdkIframeEmbedSetupExperience,
    title: "Dashboard",
    description: "Embed an entire dashboard with multiple charts and filters",
  },
  {
    value: "chart" as SdkIframeEmbedSetupExperience,
    title: "Chart",
    description: "Embed a single chart or visualization",
  },
  {
    value: "exploration" as SdkIframeEmbedSetupExperience,
    title: "Exploration",
    description: "Embed an interactive data exploration experience",
  },
];

type EmbedStepConfig = {
  id: SdkIframeEmbedSetupStep;
  component: React.ComponentType;
  skipFor?: SdkIframeEmbedSetupExperience[];
};

export const EMBED_STEPS: EmbedStepConfig[] = [
  {
    id: "select-embed-experience",
    component: SelectEmbedExperienceStep,
  },
  {
    id: "select-embed-resource",
    component: SelectEmbedResourceStep,
    skipFor: ["exploration"],
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

/** How long to wait before saving the embed settings to the user settings. */
export const PERSIST_EMBED_SETTINGS_DEBOUNCE_MS = 1000;
