/* eslint "react/prop-types": "warn" */

import React from "react";
import VisualizationErrorMessage from './VisualizationErrorMessage';
import Visualization from "metabase/visualizations/components/Visualization.jsx";
import { datasetContainsNoResults } from "metabase/lib/dataset";
import { DatasetQuery } from "metabase/meta/types/Card";
import { t } from 'c-3po';

type Props = {
    question: Question,
    isObjectDetail: boolean,
    result: any,
    results: any[],
    lastRunDatasetQuery: DatasetQuery,
    navigateToNewCardInsideQB: (any) => void
}
const VisualizationResult = ({question, isObjectDetail, lastRunDatasetQuery, navigateToNewCardInsideQB, result, results, ...props}: Props) => {
    const noResults = datasetContainsNoResults(result.data);
    if (noResults) {
        // successful query but there were 0 rows returned with the result
        return <VisualizationErrorMessage
                  type='noRows'
                  title={t`No results!`}
                  message={t`This may be the answer you’re looking for. If not, chances are your filters are too specific. Try removing or changing your filters to see more data.`}
                  action={
                    <button className="Button" onClick={() => window.history.back() }>
                        {t`Back to last run`}
                    </button>
                  }
              />
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
};

export default VisualizationResult;
