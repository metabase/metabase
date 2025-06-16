import type { SdkIframeEmbedSetupType } from "./types";

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

export const API_KEY_PLACEHOLDER = "mb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
