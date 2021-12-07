/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t, jt } from "ttag";
import cx from "classnames";
import _ from "underscore";

import ErrorMessage from "metabase/components/ErrorMessage";
import Visualization from "metabase/visualizations/components/Visualization";
import { datasetContainsNoResults } from "metabase/lib/dataset";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import Modal from "metabase/components/Modal";
import { ALERT_TYPE_ROWS } from "metabase-lib/lib/Alert";

const ALLOWED_VISUALIZATION_PROPS = [
  // Table Interactive
  "tableHeaderHeight",
  "renderTableHeaderWrapper",
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

  render() {
    const {
      question,
      isDirty,
      queryBuilderMode,
      navigateToNewCardInsideQB,
      result,
      rawSeries,
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
                      <a className="link" onClick={this.showCreateAlertModal}>
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
      return (
        <Visualization
          className={className}
          rawSeries={rawSeries}
          onChangeCardAndRun={navigateToNewCardInsideQB}
          isEditing={true}
          isQueryBuilder={true}
          queryBuilderMode={queryBuilderMode}
          showTitle={false}
          metadata={question.metadata()}
          handleVisualizationClick={this.props.handleVisualizationClick}
          onOpenChartSettings={this.props.onOpenChartSettings}
          onUpdateWarnings={this.props.onUpdateWarnings}
          onUpdateVisualizationSettings={
            this.props.onUpdateVisualizationSettings
          }
          query={this.props.query}
          {...vizSpecificProps}
        />
      );
    }
  }
}
