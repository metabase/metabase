/* eslint "react/prop-types": "warn" */

import React from "react";
import VisualizationErrorMessage from './VisualizationErrorMessage';
import Visualization from "metabase/visualizations/components/Visualization.jsx";
import { datasetContainsNoResults } from "metabase/lib/dataset";
import { DatasetQuery } from "metabase/meta/types/Card";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import { Component } from "react/lib/ReactBaseClasses";
import Modal from "metabase/components/Modal";
import { ALERT_TYPE_ROWS } from "metabase-lib/lib/Alert";

type Props = {
    question: Question,
    isObjectDetail: boolean,
    result: any,
    results: any[],
    isDirty: boolean,
    lastRunDatasetQuery: DatasetQuery,
    navigateToNewCardInsideQB: (any) => void
}

export default class VisualizationResult extends Component {
    props: Props
    state = {
        showCreateAlertModal: false
    }

    showCreateAlertModal = () => {
        this.setState({ showCreateAlertModal: true })
    }

    onCloseCreateAlertModal = () =>  {
        this.setState({ showCreateAlertModal: false })
    }

    render() {
        const { question, isDirty, isObjectDetail, lastRunDatasetQuery, navigateToNewCardInsideQB, result, results, ...props } = this.props
        const { showCreateAlertModal } = this.state

        const noResults = datasetContainsNoResults(result.data);
        if (noResults) {
            const supportsRowsPresentAlert = question.alertType() === ALERT_TYPE_ROWS

            // successful query but there were 0 rows returned with the result
            return <div className="flex flex-full">
                <VisualizationErrorMessage
                    type='noRows'
                    title='No results!'
                    message='This may be the answer you’re looking for. If not, try removing or changing your filters to make them less specific.'
                    action={
                        <div>
                            { supportsRowsPresentAlert && !isDirty && <p>
                                You can also <a className="link" onClick={this.showCreateAlertModal}>get an alert</a> when there are any results.
                            </p> }
                            <button className="Button" onClick={() => window.history.back() }>
                                Back to last run
                            </button>
                        </div>
                    }
                />
                { showCreateAlertModal && <Modal full onClose={this.onCloseCreateAlertModal}>
                    <CreateAlertModalContent onCancel={this.onCloseCreateAlertModal} onAlertCreated={this.onCloseCreateAlertModal} />
                </Modal> }
            </div>
        } else {
            // we want to provide the visualization with a card containing the latest
            // "display", "visualization_settings", etc, (to ensure the correct visualization is shown)
            // BUT the last executed "dataset_query" (to ensure data matches the query)
            const series = question.atomicQueries().map((metricQuery, index) => ({
                card: {
                    ...question.card(),
                    display: isObjectDetail ? "object" : question.card().display,
                    dataset_query: lastRunDatasetQuery
                },
                data: results[index] && results[index].data
            }));

            return <Visualization
                series={series}
                onChangeCardAndRun={navigateToNewCardInsideQB}
                isEditing={true}
                card={question.card()}
                // Table:
                {...props}
            />
        }
    }
}
