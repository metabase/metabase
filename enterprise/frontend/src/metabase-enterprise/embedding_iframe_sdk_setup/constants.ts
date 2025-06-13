import type { EmbedParameter, EmbedType } from "./types";

export const EMBED_TYPES = [
  {
    value: "dashboard" as EmbedType,
    title: "Dashboard",
    description: "Embed an entire dashboard with multiple charts and filters",
  },
  {
    value: "chart" as EmbedType,
    title: "Chart",
    description: "Embed a single chart or visualization",
  },
  {
    value: "exploration" as EmbedType,
    title: "Exploration",
    description: "Embed an interactive data exploration experience",
  },
];

export const EXAMPLE_PARAMETERS: EmbedParameter[] = [
  {
    id: "date_range",
    name: "Date Range",
    placeholder: "Last 30 days",
  },
  {
    id: "region",
    name: "Region",
    placeholder: "All regions",
  },
  {
    id: "product_category",
    name: "Product Category",
    placeholder: "All categories",
  },
];

export const API_KEY_PLACEHOLDER = "mb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
