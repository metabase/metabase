import { t } from "ttag";

const TRANSLATED_NAME_BY_MODEL_TYPE: Record<string, string> = {
  action: t`Action`,
  card: t`Question`,
  collection: t`Collection`,
  dashboard: t`Dashboard`,
  database: t`Database`,
  dataset: t`Model`,
  "indexed-entity": t`Indexed record`,
  metric: t`Metric`,
  pulse: t`Pulse`,
  segment: t`Segment`,
  table: t`Table`,
};

export const getTranslatedEntityName = (type: string) =>
  TRANSLATED_NAME_BY_MODEL_TYPE[type] || null;
