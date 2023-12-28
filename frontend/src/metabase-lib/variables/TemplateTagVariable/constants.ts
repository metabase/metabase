import type { TemplateTagType } from "metabase-types/api";

export const VARIABLE_ICONS: Record<TemplateTagType, string | null> = {
  text: "string",
  number: "int",
  date: "calendar",
  dimension: null,
  card: null,
  snippet: null,
};
