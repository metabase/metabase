import { SelectEmbedTypeStep } from "./components/SelectEmbedTypeStep";
import type { SdkIframeEmbedSetupStep, SdkIframeEmbedSetupType } from "./types";

export const EMBED_TYPES = [
  {
    value: "dashboard" as SdkIframeEmbedSetupType,
    title: "Dashboard",
    description: "Embed an entire dashboard with multiple charts and filters",
  },
  {
    value: "chart" as SdkIframeEmbedSetupType,
    title: "Chart",
    description: "Embed a single chart or visualization",
  },
  {
    value: "exploration" as SdkIframeEmbedSetupType,
    title: "Exploration",
    description: "Embed an interactive data exploration experience",
  },
];

type EmbedStepConfig = {
  id: SdkIframeEmbedSetupStep;
  component: React.ComponentType;
  skipFor?: SdkIframeEmbedSetupType[];
};

export const EMBED_STEPS: EmbedStepConfig[] = [
  {
    id: "select-embed-type",
    component: SelectEmbedTypeStep,
  },
  {
    id: "select-entity",
    component: () => "select entity placeholder",
    skipFor: ["exploration"],
  },
  {
    id: "configure",
    component: () => "configure placeholder",
  },
  {
    id: "get-code",
    component: () => "get code placeholder",
  },
];
