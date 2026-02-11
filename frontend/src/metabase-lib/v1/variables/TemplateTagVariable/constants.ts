// TODO: migrate icons away from metabase-lib
// eslint-disable-next-line no-restricted-imports
import type { IconName } from "metabase/ui";
import type { TemplateTagType } from "metabase-types/api";

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
