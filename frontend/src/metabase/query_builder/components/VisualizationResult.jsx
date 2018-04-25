/* eslint "react/prop-types": "warn" */

import React, { Component } from "react";
import { t, jt } from "c-3po";

import ErrorMessage from "metabase/components/ErrorMessage";
import Visualization from "metabase/visualizations/components/Visualization.jsx";
import { datasetContainsNoResults } from "metabase/lib/dataset";
import { DatasetQuery } from "metabase/meta/types/Card";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import Modal from "metabase/components/Modal";
import { ALERT_TYPE_ROWS } from "metabase-lib/lib/Alert";

type Props = {
  question: Question,
  isObjectDetail: boolean,
  result: any,
  results: any[],
  isDirty: boolean,
  lastRunDatasetQuery: DatasetQuery,
  navigateToNewCardInsideQB: any => void,
  rawSeries: any,
};

export default class VisualizationResult extends Component {
  props: Props;
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
      navigateToNewCardInsideQB,
      result,
      rawSeries,
      ...props
    } = this.props;
    const { showCreateAlertModal } = this.state;

    const noResults = datasetContainsNoResults(result.data);
    if (noResults) {
      const supportsRowsPresentAlert = question.alertType() === ALERT_TYPE_ROWS;

      // successful query but there were 0 rows returned with the result
      return (
        <div className="flex flex-full">
          <ErrorMessage
            type="noRows"
            title="No results!"
            message={t`This may be the answer you’re looking for. If not, try removing or changing your filters to make them less specific.`}
            action={
              <div>
                {supportsRowsPresentAlert &&
                  !isDirty && (
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
                  {t`Back to last run`}
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
      return (
        <Visualization
          rawSeries={rawSeries}
          onChangeCardAndRun={navigateToNewCardInsideQB}
          isEditing={true}
          card={question.card()}
          // Table:
          {...props}
        />
      );
    }
  }
}
