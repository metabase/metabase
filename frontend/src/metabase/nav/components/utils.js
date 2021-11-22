import { t } from "ttag";

const TRANSLATED_NAME_BY_MODEL_TYPE = {
  card: t`Question`,
  dataset: t`Dataset`,
  dashboard: t`Dashboard`,
  table: t`Table`,
  database: t`Database`,
  collection: t`Collection`,
  segment: t`Segment`,
  metric: t`Metric`,
  pulse: t`Pulse`,
};

export const getTranslatedEntityName = type =>
  TRANSLATED_NAME_BY_MODEL_TYPE[type] || null;
