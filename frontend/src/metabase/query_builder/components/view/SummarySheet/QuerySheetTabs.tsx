import cx from "classnames";
import { t } from "ttag";

import { ActionIcon, Box, Icon, Tooltip, UnstyledButton } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import S from "./SummarySheet.module.css";
import { removeSummaryDefinition, useSummaryDefinition } from "./summary-store";
import { getDataLabel, getSummaryKey } from "./utils";

type QuerySheetTabsProps = {
  question: Question;
  isShowingSummary: boolean;
  onShowData: () => void;
  onShowSummary: () => void;
};

/** Spreadsheet-style tabs at the bottom of the query builder: the data itself and its summary. */
export function QuerySheetTabs({
  question,
  isShowingSummary,
  onShowData,
  onShowSummary,
}: QuerySheetTabsProps) {
  const summaryKey = getSummaryKey(question);
  const summaryDefinition = useSummaryDefinition(summaryKey);
  const hasSummaryTab = isShowingSummary || summaryDefinition != null;

  const handleDeleteSummary = () => {
    if (summaryKey != null) {
      removeSummaryDefinition(summaryKey);
    }
    onShowData();
  };

  return (
    <Box className={S.sheetTabs} role="tablist" data-testid="query-sheet-tabs">
      <UnstyledButton
        className={cx(S.sheetTab, { [S.sheetTabActive]: !isShowingSummary })}
        role="tab"
        aria-selected={!isShowingSummary}
        onClick={onShowData}
      >
        <Icon name="table2" />
        {getDataLabel(question)}
      </UnstyledButton>
      {hasSummaryTab && (
        <Box
          className={cx(S.sheetTab, {
            [S.sheetTabActive]: isShowingSummary,
            [S.sheetTabSummaryActive]: isShowingSummary,
          })}
        >
          <UnstyledButton
            className={S.chipButton}
            role="tab"
            aria-selected={isShowingSummary}
            onClick={onShowSummary}
          >
            <Icon name="pivot_table" />
            {t`Summary`}
          </UnstyledButton>
          <Tooltip label={t`Delete summary`}>
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={t`Delete summary`}
              onClick={handleDeleteSummary}
            >
              <Icon name="close" size={12} />
            </ActionIcon>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}
