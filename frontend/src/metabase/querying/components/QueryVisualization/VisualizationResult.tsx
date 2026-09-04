import { t } from "ttag";
import _ from "underscore";

import { ErrorMessage } from "metabase/common/components/ErrorMessage";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { Button, Flex } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";

import { defaultClickActionMode } from "../../click-actions/lib/modes";

import type { QueryVisualizationProps } from "./types";

const ALLOWED_VISUALIZATION_PROPS = [
  // Table
  "isShowingDetailsOnlyColumns",
  // Table Interactive
  "hasMetadataPopovers",
  "tableHeaderHeight",
  "scrollToColumn",
  "renderTableHeader",
  "hasColumnReordering",
  "renderEmptyMessage",
  "zoomedRowIndex",
  // Legend
  "hideLegend",
] as const;

export function VisualizationResult(props: QueryVisualizationProps) {
  const {
    question,
    queryBuilderMode,
    navigateToNewCardInsideQB,
    result,
    rawSeries,
    timelineEvents,
    selectedTimelineEventIds,
    onNavigateBack,
    className,
    isRunning,
    isShowingSummarySidebar,
    editSummary,
    renderEmptyMessage,
    noResultsAction,
    isRawTable,
    scrollToLastColumn,
    onZoomRow,
    getExtraDataForClick,
  } = props;

  if (!result) {
    return null;
  }

  const noResults = datasetContainsNoResults(result.data);
  if (noResults && !isRunning && !renderEmptyMessage) {
    const supportsBackToPreviousResult =
      !isEmbeddingSdk() || Boolean(onNavigateBack);

    // successful query but there were 0 rows returned with the result
    return (
      <Flex className={className}>
        <ErrorMessage
          type="noRows"
          title={t`No results`}
          message={t`This may be the answer you’re looking for. If not, try removing or changing your filters to make them less specific.`}
          action={
            <div>
              {noResultsAction}

              {supportsBackToPreviousResult && (
                <Button
                  variant="default"
                  onClick={() =>
                    onNavigateBack ? onNavigateBack() : window.history.back()
                  }
                >
                  {t`Back to previous results`}
                </Button>
              )}
            </div>
          }
        />
      </Flex>
    );
  }

  const vizSpecificProps = _.pick(props, ...ALLOWED_VISUALIZATION_PROPS);
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hasDrills = isEditable;
  return (
    <Visualization
      className={className}
      rawSeries={rawSeries ?? undefined}
      onChangeCardAndRun={hasDrills ? navigateToNewCardInsideQB : undefined}
      isEditing={true}
      isObjectDetail={false}
      isQueryBuilder={true}
      isRawTable={isRawTable}
      scrollToLastColumn={scrollToLastColumn}
      isShowingSummarySidebar={isShowingSummarySidebar}
      isRunning={isRunning}
      editSummary={editSummary}
      queryBuilderMode={queryBuilderMode}
      showTitle={false}
      canToggleSeriesVisibility
      metadata={question.metadata()}
      timelineEvents={timelineEvents}
      selectedTimelineEventIds={selectedTimelineEventIds}
      getExtraDataForClick={getExtraDataForClick}
      onZoomRow={onZoomRow}
      handleVisualizationClick={props.handleVisualizationClick}
      onOpenTimelines={props.onOpenTimelines}
      onSelectTimelineEvents={props.selectTimelineEvents}
      onDeselectTimelineEvents={props.deselectTimelineEvents}
      onOpenChartSettings={props.onOpenChartSettings}
      onUpdateQuestion={props.onUpdateQuestion}
      onUpdateWarnings={props.onUpdateWarnings}
      onHeaderColumnReorder={props.onHeaderColumnReorder}
      onUpdateVisualizationSettings={props.onUpdateVisualizationSettings}
      onVisualizationRendered={props.onVisualizationRendered}
      mode={props.mode ?? defaultClickActionMode}
      {...vizSpecificProps}
    />
  );
}
