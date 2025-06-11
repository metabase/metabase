import cx from "classnames";
import { Component } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import { ErrorMessage } from "metabase/components/ErrorMessage";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { CreateOrEditQuestionAlertModal } from "metabase/notifications/modals/CreateOrEditQuestionAlertModal/CreateOrEditQuestionAlertModal";
import type { MantineTheme } from "metabase/ui";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import Visualization from "metabase/visualizations/components/Visualization";
import type { ClickObject, OnChangeCardAndRunOpts } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { ALERT_TYPE_ROWS } from "metabase-lib/v1/Alert";
import type Question from "metabase-lib/v1/Question";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";
import type { Card, DatasetColumn, DatasetQuery, RawSeries, SingleSeries, TimelineEvent } from "metabase-types/api";
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
];

interface VisualizationResultProps {
  question: Question;
  isDirty?: boolean;
  onVisualizationRendered?: () => void;
  isObjectDetail?: boolean;
  queryBuilderMode?: QueryBuilderMode;
  navigateToNewCardInsideQB?: (opts: OnChangeCardAndRunOpts) => Promise<void>;
  result: any;
  rawSeries: RawSeries | null;
  timelineEvents?: TimelineEvent[];
  selectedTimelineEventIds?: number[];
  onNavigateBack?: () => void;
  className?: string;
  isRunning?: boolean;
  isShowingSummarySidebar?: boolean;
  onEditSummary?: () => void;
  renderEmptyMessage?: boolean;
  onUpdateVisualizationSettings?: (settings: any) => void;
  onHeaderColumnReorder?: (columnName: string) => void;
  onUpdateWarnings?: (warnings: string[]) => void;
  onOpenChartSettings?: (data: {
    initialChartSettings: { section: string };
    showSidebarTitle?: boolean;
  }) => void;
  handleVisualizationClick?: (clicked: ClickObject | null) => void;
  onOpenTimelines?: () => void;
  selectTimelineEvents?: (events: TimelineEvent[]) => void;
  deselectTimelineEvents?: () => void;
  onUpdateQuestion?: (question: Question) => void;

  isShowingDetailsOnlyColumns?: boolean;
  hasMetadataPopovers?: boolean;
  tableHeaderHeight?: number;
  scrollToColumn?: number
  renderTableHeader?: (
    column: DatasetColumn,
    index: number,
    theme: MantineTheme,
  ) => React.ReactNode;
  mode?: Mode | null | undefined;
}

// eslint-disable-next-line import/no-default-export
export default class VisualizationResult extends Component<VisualizationResultProps> {
  state = {
    showCreateAlertModal: false,
  };

  showCreateAlertModal = () => {
    this.setState({ showCreateAlertModal: true });
  };

  onCloseCreateAlertModal = () => {
    this.setState({ showCreateAlertModal: false });
  };

  getObjectDetailData = (series: RawSeries | null): (SingleSeries | { card: Card<DatasetQuery> })[] => {
    if (!series) {
      return [];
    }

    return [
      {
        ...series[0],
        card: { ...series[0].card, display: "object" },
      },
    ];
  };

  render() {
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
    } = this.props;
    const { showCreateAlertModal } = this.state;

    const noResults = datasetContainsNoResults(result.data);
    if (noResults && !isRunning && !renderEmptyMessage) {
      // @ts-expect-error - TODO: pass a parameter to alertType
      const supportsRowsPresentAlert = question.alertType() === ALERT_TYPE_ROWS;

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
                        onClick={this.showCreateAlertModal}
                      >
                        {t`get an alert`}
                      </a>
                    )} when there are some results.`}
                  </p>
                )}
                <button
                  className={ButtonsS.Button}
                  onClick={() =>
                    onNavigateBack ? onNavigateBack() : window.history.back()
                  }
                >
                  {t`Back to previous results`}
                </button>
              </div>
            }
          />
          {showCreateAlertModal && (
            <CreateOrEditQuestionAlertModal
              onClose={this.onCloseCreateAlertModal}
              onAlertCreated={this.onCloseCreateAlertModal}
            />
          )}
        </div>
      );
    } else {
      const vizSpecificProps = _.pick(
        this.props,
        ...ALLOWED_VISUALIZATION_PROPS,
      );
      const { isEditable } = Lib.queryDisplayInfo(question.query());
      const hasDrills = isEditable;
      return (
        <>
          <Visualization
            className={className}
            rawSeries={rawSeries ?? undefined}
            onChangeCardAndRun={
              hasDrills ? navigateToNewCardInsideQB : undefined
            }
            isEditing={true}
            isObjectDetail={false}
            isQueryBuilder={true}
            isShowingSummarySidebar={isShowingSummarySidebar}
            onEditSummary={onEditSummary}
            queryBuilderMode={queryBuilderMode}
            showTitle={false}
            canToggleSeriesVisibility
            metadata={question.metadata()}
            timelineEvents={timelineEvents}
            selectedTimelineEventIds={selectedTimelineEventIds}
            handleVisualizationClick={this.props.handleVisualizationClick}
            onOpenTimelines={this.props.onOpenTimelines}
            onSelectTimelineEvents={this.props.selectTimelineEvents}
            onDeselectTimelineEvents={this.props.deselectTimelineEvents}
            onOpenChartSettings={this.props.onOpenChartSettings}
            onUpdateQuestion={this.props.onUpdateQuestion}
            onUpdateWarnings={this.props.onUpdateWarnings}
            onHeaderColumnReorder={this.props.onHeaderColumnReorder}
            onUpdateVisualizationSettings={
              this.props.onUpdateVisualizationSettings
            }
            onVisualizationRendered={this.props.onVisualizationRendered}
            {...vizSpecificProps}
          />
          {this.props.isObjectDetail && (
            <Visualization
              isObjectDetail={true}
              rawSeries={this.getObjectDetailData(rawSeries)}
            />
          )}
        </>
      );
    }
  }
}
