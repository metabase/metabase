export const virtualCardDisplayTypes = [
  "action",
  "heading",
  "link",
  "placeholder",
  "text",
  "iframe",
] as const;

export type VirtualCardDisplay = (typeof virtualCardDisplayTypes)[number];

export const isVirtualCardDisplayType = (
  value: string,
): value is VirtualCardDisplay =>
  typeof value === "string" &&
  virtualCardDisplayTypes.includes(value as VirtualCardDisplay);

export const cardDisplayTypes = [
  "table",
  "bar",
  "line",
  "pie",
  "scalar",
  "row",
  "area",
  "combo",
  "pivot",
  "smartscalar",
  "gauge",
  "progress",
  "funnel",
  "object",
  "map",
  "scatter",
  "boxplot",
  "waterfall",
  "sankey",
  "list",
] as const;

export const isCardDisplayType = (value: unknown): value is CardDisplayType =>
  typeof value === "string" &&
  cardDisplayTypes.includes(value as CardDisplayType);

export type CardDisplayType = (typeof cardDisplayTypes)[number];

export type VisualizationDisplay = VirtualCardDisplay | CardDisplayType;
