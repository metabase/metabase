import type { SdkIframeEmbedSetupType } from "./types";

export const PERSIST_EMBED_SETTINGS_DEBOUNCE_MS = 3000;

export const API_KEY_PLACEHOLDER = "mb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

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
