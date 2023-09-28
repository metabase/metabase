import { t } from "ttag";

const TRANSLATED_NAME_BY_MODEL_TYPE: Record<string, string> = {
  card: t`Question`,
  dataset: t`Model`,
  dashboard: t`Dashboard`,
  table: t`Table`,
  database: t`Database`,
  collection: t`Collection`,
  segment: t`Segment`,
  "indexed-entity": t`Indexed Entity`,
  metric: t`Metric`,
  pulse: t`Pulse`,
};

export const getTranslatedEntityName = (type: string) =>
  TRANSLATED_NAME_BY_MODEL_TYPE[type] || null;
