import { c } from "ttag";

import { getAnalysisKindInfo } from "metabase/product-analytics-core";
import { Title } from "metabase/ui";
import type { ProductAnalyticsKind } from "metabase-types/api";

type AnalysisTitleProps = {
  kind: ProductAnalyticsKind;
  /** The picked table's name, once there is one. */
  tableName: string | undefined;
};

/** The title of a new analysis, e.g. "Habit analysis on Events". */
export const AnalysisTitle = ({ kind, tableName }: AnalysisTitleProps) => {
  const { name } = getAnalysisKindInfo(kind);
  const title =
    tableName !== undefined
      ? c("{0} is a type of analysis, e.g. Habit; {1} is a table name")
          .t`${name} analysis on ${tableName}`
      : c("{0} is a type of analysis, e.g. Habit").t`${name} analysis`;
  return (
    <Title order={3} fw="normal">
      {title}
    </Title>
  );
};
