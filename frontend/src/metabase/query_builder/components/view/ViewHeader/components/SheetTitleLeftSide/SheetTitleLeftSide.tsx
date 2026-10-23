import { useMemo } from "react";
import { t } from "ttag";

import { Box, Text, UnstyledButton } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { useCompareState } from "../../../CompareSheet";
import { useSummaryDefinition } from "../../../SummarySheet/summary-store";
import {
  buildSummaryQuery,
  getDataLabel,
  getSummaryBase,
  getSummaryKey,
} from "../../../SummarySheet/utils";
import { ViewHeading, ViewSubHeading } from "../../../ViewSection";
import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";
import { describeQueryStage } from "../AdHocQuestionDescription/utils";

import S from "./SheetTitleLeftSide.module.css";

type SheetTitleLeftSideProps = {
  question: Question;
  activeSheet: "summary" | "compare";
  onShowData: () => void;
  onShowSummary: () => void;
};

/**
 * The header title while the summary or compare sheet is showing: what the sheet shows, over
 * a trail back to the data and summary sheets it came from.
 */
export function SheetTitleLeftSide({
  question,
  activeSheet,
  onShowData,
  onShowSummary,
}: SheetTitleLeftSideProps) {
  const summaryKey = getSummaryKey(question);
  const summaryDefinition = useSummaryDefinition(summaryKey);
  const compareState = useCompareState(summaryKey);

  const summaryTitle = useMemo(() => {
    if (!summaryDefinition) {
      return null;
    }
    const base = getSummaryBase(question.query());
    const summaryQuery = buildSummaryQuery(base, summaryDefinition);
    return summaryQuery
      ? describeQueryStage(summaryQuery, base.stageIndex)
      : null;
  }, [question, summaryDefinition]);

  const title =
    activeSheet === "summary"
      ? (summaryTitle ?? t`New summary`)
      : (compareState?.title ?? t`Compare`);

  return (
    <Box miw={0}>
      <ViewHeading className={ViewTitleHeaderS.AdHocViewHeading} truncate>
        {title}
      </ViewHeading>
      <ViewSubHeading className={ViewTitleHeaderS.ViewHeaderLeftSubHeading}>
        <Text className={S.trail} component="span" c="text-secondary">
          <UnstyledButton className={S.trailItem} onClick={onShowData}>
            {getDataLabel(question)}
          </UnstyledButton>
          {activeSheet === "compare" && summaryTitle && (
            <>
              <span className={S.trailSeparator}>/</span>
              <UnstyledButton className={S.trailItem} onClick={onShowSummary}>
                {summaryTitle}
              </UnstyledButton>
            </>
          )}
        </Text>
      </ViewSubHeading>
    </Box>
  );
}
