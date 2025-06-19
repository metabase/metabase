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

export const EMBED_STEPS: Array<{
  id: SdkIframeEmbedSetupStep;
  component: React.ComponentType;
  skipFor?: SdkIframeEmbedSetupType[];
}> = [
  {
    id: "select-embed-type",
    component: SelectEmbedTypeStep,
  },
  {
    id: "select-entity",
    component: () => null,
    skipFor: ["exploration"],
  },
  {
    id: "configure",
    component: () => null,
  },
  {
    id: "get-code",
    component: () => null,
  },
];
