import type { TemplateTagType } from "metabase-types/api";
import type { IconName } from "metabase-types/ui";

export const VARIABLE_ICONS: Record<TemplateTagType, IconName | null> = {
  text: "string",
  number: "int",
  date: "calendar",
  boolean: "io",
  dimension: null,
  "temporal-unit": "clock",
  card: null,
  snippet: null,
  table: null,
};
