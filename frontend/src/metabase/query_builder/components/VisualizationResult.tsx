import cx from "classnames";
import { useState } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import type { NavigateToNewCardParams } from "embedding-sdk-bundle/types";
import { ErrorMessage } from "metabase/common/components/ErrorMessage";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { CreateOrEditQuestionAlertModalWithQuestion } from "metabase/notifications/modals/CreateOrEditQuestionAlertModal/CreateOrEditQuestionAlertModal";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import { ALERT_TYPE_ROWS } from "metabase-lib/v1/Alert";
import type Question from "metabase-lib/v1/Question";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";
import type {
  Dataset,
  DatasetColumn,
  RawSeries,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";
import type { QueryBuilderMode } from "metabase-types/store";

const ALLOWED_VISUALIZATION_PROPS = [
  // Table
  "isShowingDetailsOnlyColumns",
  // Table Interactive
  "hasMetadataPopovers",
  "tableHeaderHeight",
  "scrollToColumn",
  "renderTableHeader",
  "mode",
  "renderEmptyMessage",
  "zoomedRowIndex",
  // Legend
  "hideLegend",
];

type VisualizationResultProps = {
  className?: string;
  isDirty?: boolean;
  isObjectDetail?: boolean;
  isRunning?: boolean;
  navigateToNewCardInsideQB?:
    | ((opts: NavigateToNewCardParams) => Promise<void>)
    | null;
  queryBuilderMode?: QueryBuilderMode;
  question: Question;
  rawSeries?: RawSeries | null;
  renderEmptyMessage?: boolean;
  result: Dataset;
  maxTableRows?: number;

  deselectTimelineEvents?: () => void;
  onOpenTimelines?: () => void;
  selectTimelineEvents?: (events: TimelineEvent[]) => void;
  selectedTimelineEventIds?: TimelineEventId[];
  timelineEvents?: TimelineEvent[];

  isShowingSummarySidebar?: boolean;
  onEditSummary?: () => void;

  handleVisualizationClick?: (
    clicked: {
      element: unknown;
      column: DatasetColumn;
    } | null,
  ) => void;
  onHeaderColumnReorder?: (columnName: string) => void;
  onNavigateBack?: () => void;
  onOpenChartSettings?: () => void;
  onUpdateQuestion?: () => void;
  onUpdateVisualizationSettings?: () => void;
  onUpdateWarnings?: (warnings: string[]) => void;
  onVisualizationRendered?: () => void;
};

const getObjectDetailData = (series: RawSeries): RawSeries => [
  {
    ...series[0],
    card: { ...series[0].card, display: "object" },
  },
];

export function VisualizationResult(props: VisualizationResultProps) {
  const {
    question,
    isDirty,
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
    onEditSummary,
    renderEmptyMessage,
    handleVisualizationClick,
    onOpenTimelines,
    selectTimelineEvents,
    deselectTimelineEvents,
    onOpenChartSettings,
    onUpdateQuestion,
    onUpdateWarnings,
    onHeaderColumnReorder,
    onUpdateVisualizationSettings,
    onVisualizationRendered,
    isObjectDetail,
  } = props;

  const [showCreateAlertModal, setShowCreateAlertModal] = useState(false);

  const noResults = datasetContainsNoResults(result.data);
  if (noResults && !isRunning && !renderEmptyMessage) {
    const supportsRowsPresentAlert = question.alertType() === ALERT_TYPE_ROWS;

    const supportsBackToPreviousResult = !isEmbeddingSdk() || !!onNavigateBack;

    // successful query but there were 0 rows returned with the result
    return (
      <div className={cx(className, CS.flex)}>
        <ErrorMessage
          type="noRows"
          title={t`No results!`}
          message={t`This may be the answer you’re looking for. If not, try removing or changing your filters to make them less specific.`}
          action={
            <div>
              {supportsRowsPresentAlert && !isDirty && (
                <p>
                  {jt`You can also ${(
                    <a
                      className={CS.link}
                      key="link"
                      onClick={() => setShowCreateAlertModal(true)}
                    >
                      {t`get an alert`}
                    </a>
                  )} when there are some results.`}
                </p>
              )}

              {supportsBackToPreviousResult && (
                <button
                  className={ButtonsS.Button}
                  onClick={() =>
                    onNavigateBack ? onNavigateBack() : window.history.back()
                  }
                >
                  {t`Back to previous results`}
                </button>
              )}
            </div>
          }
        />
        {showCreateAlertModal && (
          <CreateOrEditQuestionAlertModalWithQuestion
            onClose={() => setShowCreateAlertModal(false)}
            onAlertCreated={() => setShowCreateAlertModal(false)}
          />
        )}
      </div>
    );
  } else {
    const vizSpecificProps = _.pick(props, ...ALLOWED_VISUALIZATION_PROPS);
    const { isEditable } = Lib.queryDisplayInfo(question.query());
    const hasDrills = isEditable;
    return (
      <>
        <Visualization
          className={className}
          rawSeries={rawSeries ?? undefined}
          onChangeCardAndRun={hasDrills ? navigateToNewCardInsideQB : undefined}
          isEditing={true}
          isObjectDetail={false}
          isQueryBuilder={true}
          isShowingSummarySidebar={isShowingSummarySidebar}
          isRunning={isRunning}
          onEditSummary={onEditSummary}
          queryBuilderMode={queryBuilderMode}
          showTitle={false}
          canToggleSeriesVisibility
          metadata={question.metadata()}
          timelineEvents={timelineEvents}
          selectedTimelineEventIds={selectedTimelineEventIds}
          onDeselectTimelineEvents={deselectTimelineEvents}
          handleVisualizationClick={handleVisualizationClick}
          onOpenTimelines={onOpenTimelines}
          onSelectTimelineEvents={selectTimelineEvents}
          onOpenChartSettings={onOpenChartSettings}
          onUpdateQuestion={onUpdateQuestion}
          onUpdateWarnings={onUpdateWarnings}
          onHeaderColumnReorder={onHeaderColumnReorder}
          onUpdateVisualizationSettings={onUpdateVisualizationSettings}
          onVisualizationRendered={onVisualizationRendered}
          {...vizSpecificProps}
        />
        {isObjectDetail && (
          <Visualization
            isObjectDetail={true}
            rawSeries={rawSeries ? getObjectDetailData(rawSeries) : undefined}
          />
        )}
      </>
    );
  }
}
