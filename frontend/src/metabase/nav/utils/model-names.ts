import { t } from "ttag";

const TRANSLATED_NAME_BY_MODEL_TYPE: Record<string, string> = {
  app: t`App`,
  card: t`Question`,
  dataset: t`Dataset`,
  dashboard: t`Dashboard`,
  table: t`Table`,
  database: t`Database`,
  collection: t`Collection`,
  segment: t`Segment`,
  metric: t`Metric`,
  page: t`Page`,
  pulse: t`Pulse`,
};

export const getTranslatedEntityName = (type: string) =>
  TRANSLATED_NAME_BY_MODEL_TYPE[type] || null;
