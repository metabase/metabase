import cx from "classnames";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { ActionIcon, Box, Icon, Tooltip, UnstyledButton } from "metabase/ui";
import { visualizations } from "metabase/viz-core";
import type Question from "metabase-lib/v1/Question";

import { getFirstQueryResult, getIsVisualized } from "../../../store/selectors";
import {
  CenterViewFooterButtonGroup,
  RightViewFooterButtonGroup,
  useVisualizationSidebarToggles,
} from "../ViewFooter";

import S from "./SummarySheet.module.css";
import { removeSummaryDefinition, useSummaryDefinition } from "./summary-store";
import { getDataLabel, getSummaryKey } from "./utils";

type QuerySheetTabsProps = {
  question: Question;
  isShowingSummary: boolean;
  onShowData: () => void;
  onShowSummary: () => void;
};

/**
 * The query builder footer, laid out as spreadsheet-style tabs: the data tab (with its
 * visualization picker and settings) and its summary, followed by the result details.
 */
export function QuerySheetTabs({
  question,
  isShowingSummary,
  onShowData,
  onShowSummary,
}: QuerySheetTabsProps) {
  const result = useSelector(getFirstQueryResult);
  const isVisualized = useSelector(getIsVisualized);
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
    <Box className={S.sheetBar} data-testid="query-sheet-tabs">
      <Box className={S.sheetBarTabs} role="tablist">
        <DataSheetTab
          question={question}
          isActive={!isShowingSummary}
          onShowData={onShowData}
        />
        {hasSummaryTab && (
          <Box
            className={cx(S.sheetTab, {
              [S.sheetTabActive]: isShowingSummary,
              [S.sheetTabSummaryActive]: isShowingSummary,
            })}
          >
            <UnstyledButton
              className={S.sheetTabButton}
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
      {!isShowingSummary && result && (
        <>
          {isVisualized && (
            <Box className={S.sheetBarCenter}>
              <CenterViewFooterButtonGroup />
            </Box>
          )}
          <Box className={S.sheetBarDetails}>
            <RightViewFooterButtonGroup />
          </Box>
        </>
      )}
    </Box>
  );
}

type DataSheetTabProps = {
  question: Question;
  isActive: boolean;
  onShowData: () => void;
};

function DataSheetTab({ question, isActive, onShowData }: DataSheetTabProps) {
  const {
    isShowingChartTypeSidebar,
    isShowingChartSettingsSidebar,
    toggleChartType,
    toggleChartSettings,
  } = useVisualizationSidebarToggles();

  const display = question.display();
  const visualization = visualizations.get(display);
  const visualizationIcon = visualization?.iconName ?? "table2";
  const visualizationName = visualization?.getUiName() ?? display;
  const canChangeVisualization = !question.isArchived();

  return (
    <Box
      className={cx(S.sheetTab, { [S.sheetTabActive]: isActive })}
      data-testid="query-sheet-data-tab"
    >
      <UnstyledButton
        className={S.sheetTabButton}
        role="tab"
        aria-selected={isActive}
        onClick={onShowData}
      >
        <Icon name={visualizationIcon} aria-label={visualizationName} />
        {getDataLabel(question)}
      </UnstyledButton>
      {canChangeVisualization && (
        <>
          <Tooltip label={t`Change visualization`}>
            <UnstyledButton
              className={cx(S.sheetTabPill, {
                [S.sheetTabPillPressed]: isShowingChartTypeSidebar,
              })}
              aria-pressed={isShowingChartTypeSidebar}
              data-testid="viz-type-button"
              onClick={toggleChartType}
            >
              {visualizationName}
              <Icon name="chevrondown" size={10} />
            </UnstyledButton>
          </Tooltip>
          <Tooltip label={t`Visualization settings`}>
            <ActionIcon
              size="sm"
              variant={isShowingChartSettingsSidebar ? "filled" : "subtle"}
              aria-label={t`Visualization settings`}
              aria-pressed={isShowingChartSettingsSidebar}
              disabled={display === "list"}
              data-testid="viz-settings-button"
              onClick={toggleChartSettings}
            >
              <Icon name="gear" size={14} />
            </ActionIcon>
          </Tooltip>
        </>
      )}
    </Box>
  );
}
