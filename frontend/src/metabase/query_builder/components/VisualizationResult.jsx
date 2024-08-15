/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import { ErrorMessage } from "metabase/components/ErrorMessage";
import Modal from "metabase/components/Modal";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import { ALERT_TYPE_ROWS } from "metabase-lib/v1/Alert";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";

const ALLOWED_VISUALIZATION_PROPS = [
  // Table
  "isShowingDetailsOnlyColumns",
  // Table Interactive
  "hasMetadataPopovers",
  "tableHeaderHeight",
  "scrollToColumn",
  "renderTableHeaderWrapper",
  "mode",
];

export default class VisualizationResult extends Component {
  state = {
    showCreateAlertModal: false,
  };

  showCreateAlertModal = () => {
    this.setState({ showCreateAlertModal: true });
  };

  onCloseCreateAlertModal = () => {
    this.setState({ showCreateAlertModal: false });
  };

  getObjectDetailData = series => {
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
    } = this.props;
    const { showCreateAlertModal } = this.state;

    const noResults = datasetContainsNoResults(result.data);
    if (noResults && !isRunning) {
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
            <Modal full onClose={this.onCloseCreateAlertModal}>
              <CreateAlertModalContent
                onCancel={this.onCloseCreateAlertModal}
                onAlertCreated={this.onCloseCreateAlertModal}
              />
            </Modal>
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
            rawSeries={rawSeries}
            onChangeCardAndRun={
              hasDrills ? navigateToNewCardInsideQB : undefined
            }
            isEditing={true}
            isObjectDetail={false}
            isQueryBuilder={true}
            queryBuilderMode={queryBuilderMode}
            showTitle={false}
            metadata={question.metadata()}
            timelineEvents={timelineEvents}
            selectedTimelineEventIds={selectedTimelineEventIds}
            handleVisualizationClick={this.props.handleVisualizationClick}
            onOpenTimelines={this.props.onOpenTimelines}
            onSelectTimelineEvents={this.props.selectTimelineEvents}
            onDeselectTimelineEvents={this.props.deselectTimelineEvents}
            onOpenChartSettings={this.props.onOpenChartSettings}
            onUpdateWarnings={this.props.onUpdateWarnings}
            onUpdateVisualizationSettings={
              this.props.onUpdateVisualizationSettings
            }
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
