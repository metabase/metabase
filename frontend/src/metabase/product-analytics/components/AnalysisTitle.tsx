import { c } from "ttag";

import { Title } from "metabase/ui";

import { getAnalysisConfig } from "../analyses/config";
import type { AnalysisKind } from "../spec/types";

type AnalysisTitleProps = {
  kind: AnalysisKind;
  tableName: string;
  /** A saved analysis shows its name. */
  savedName?: string;
};

/** The title of a new analysis, e.g. "Funnel analysis on Events". */
export const getNewAnalysisTitle = (
  kind: AnalysisKind,
  tableName: string,
): string => {
  const name = getAnalysisConfig(kind).name;
  return c("{0} is a type of analysis, e.g. Funnel; {1} is a table name")
    .t`${name} analysis on ${tableName}`;
};

export const AnalysisTitle = ({
  kind,
  tableName,
  savedName,
}: AnalysisTitleProps) => (
  <Title order={3} fw="normal">
    {savedName ?? getNewAnalysisTitle(kind, tableName)}
  </Title>
);
