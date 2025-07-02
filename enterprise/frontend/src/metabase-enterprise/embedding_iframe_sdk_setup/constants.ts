import { SelectEmbedEntityStep } from "./components/SelectEmbedEntityStep";
import { SelectEmbedExperienceStep } from "./components/SelectEmbedExperienceStep";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupStep,
} from "./types";

/** The maximum number of recent items to show in the entity selection step. */
export const EMBED_ENTITY_LIST_MAX_RECENTS = 6;

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
    id: "select-embed-entity",
    component: SelectEmbedEntityStep,
    skipFor: ["exploration"],
  },
  {
    id: "select-embed-options",
    component: () => "select embed options placeholder",
  },
  {
    id: "get-code",
    component: () => "get code placeholder",
  },
];

/** If the activity log of the user is completely empty, we fallback to this dashboard. */
export const EMBED_FALLBACK_DASHBOARD_ID = 1;
