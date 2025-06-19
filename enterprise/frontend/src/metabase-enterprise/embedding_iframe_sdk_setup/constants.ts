import { SelectEmbedExperienceStep } from "./components/SelectEmbedExperienceStep";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupStep,
} from "./types";

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
    component: () => "select entity placeholder",
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
