import { match } from "ts-pattern";
import { t } from "ttag";

import {
  type IconName,
  PRODUCT_ANALYTICS_KINDS,
  type ProductAnalyticsKind,
} from "metabase-types/api";

export type AnalysisKindInfo = {
  kind: ProductAnalyticsKind;
  name: string;
  icon: IconName;
};

export const getAnalysisKindInfo = (
  kind: ProductAnalyticsKind,
): AnalysisKindInfo =>
  match(kind)
    .returnType<AnalysisKindInfo>()
    .with("habit", () => ({ kind, name: t`Habit`, icon: "history" }))
    .exhaustive();

/** Every kind of analysis, in the order menus list them. */
export const getAnalysisKinds = (): AnalysisKindInfo[] =>
  PRODUCT_ANALYTICS_KINDS.map(getAnalysisKindInfo);
