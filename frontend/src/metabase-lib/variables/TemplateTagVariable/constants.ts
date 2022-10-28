import { TemplateTagType } from "metabase-types/types/Query";

export const VARIABLE_ICONS: Record<TemplateTagType, string | null> = {
  text: "string",
  number: "int",
  date: "calendar",
  dimension: null,
  card: null,
  snippet: null,
};
