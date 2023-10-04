/* eslint-disable react/prop-types */
import { Component } from "react";
import { t, jt } from "ttag";
import cx from "classnames";
import _ from "underscore";

import ErrorMessage from "metabase/components/ErrorMessage";
import Visualization from "metabase/visualizations/components/Visualization";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import Modal from "metabase/components/Modal";
import { datasetContainsNoResults } from "metabase-lib/queries/utils/dataset";
import { ALERT_TYPE_ROWS } from "metabase-lib/Alert";

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
      className,
    } = this.props;
    const { showCreateAlertModal } = this.state;

    const noResults = datasetContainsNoResults(result.data);
    if (noResults) {
      const supportsRowsPresentAlert = question.alertType() === ALERT_TYPE_ROWS;

      // successful query but there were 0 rows returned with the result
      return (
        <div className={cx(className, "flex")}>
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
                        className="link"
                        key="link"
                        onClick={this.showCreateAlertModal}
                      >
                        {t`get an alert`}
                      </a>
                    )} when there are some results.`}
                  </p>
                )}
                <button
                  className="Button"
                  onClick={() => window.history.back()}
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
      const hasDrills = this.props.query.isEditable();
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
            query={this.props.query}
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
