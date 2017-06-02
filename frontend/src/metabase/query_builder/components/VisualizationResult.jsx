/* eslint "react/prop-types": "warn" */

import React from "react";
import PropTypes from "prop-types";
import QueryVisualizationObjectDetailTable from './QueryVisualizationObjectDetailTable.jsx';
import VisualizationErrorMessage from './VisualizationErrorMessage';
import Visualization from "metabase/visualizations/components/Visualization.jsx";
import { datasetContainsNoResults } from "metabase/lib/dataset";
import type { DatasetQuery } from "metabase/meta/types/Card";

type Props = {
    question: Question,
    isObjectDetail: boolean,
    lastRunDatasetQuery: DatasetQuery,
    result: any,
    results: any[]
}
const VisualizationResult = ({question, isObjectDetail, result, results, ...props}: Props) => {
    const noResults = datasetContainsNoResults(result.data);

    if (isObjectDetail) {
        return <QueryVisualizationObjectDetailTable data={result.data} {...props} />
    } else if (noResults) {
        // successful query but there were 0 rows returned with the result
        return <VisualizationErrorMessage
                  type='noRows'
                  title='No results!'
                  message='This may be the answer you’re looking for. If not, chances are your filters are too specific. Try removing or changing your filters to see more data.'
                  action={
                    <button className="Button" onClick={() => window.history.back() }>
                        Back to last run
                    </button>
                  }
              />
    } else {
        // we want to provide the visualization with a card containing the latest
        // "display", "visualization_settings", etc, (to ensure the correct visualization is shown)
        // BUT the last executed "dataset_query" (to ensure data matches the query)

        // TODO: Atte Keinänen 6/2/17: Should we provide a `lastRunDatasetQueries` or similar?
        const series = question.metrics().map((metricQuery, index) => ({
            card: {
                ...question.card(),
                dataset_query: metricQuery.datasetQuery()
            },
            data: results[index].data
        }));

        return <Visualization
                  series={series}
                  onChangeCardAndRun={props.setCardAndRun}
                  isEditing={true}
                  // Table:
                  {...props}
              />
    }
}

VisualizationResult.propTypes = {
    card:                   PropTypes.object.isRequired,
    isObjectDetail:         PropTypes.bool.isRequired,
    lastRunDatasetQuery:    PropTypes.object.isRequired,
    result:                 PropTypes.object.isRequired,
    setCardAndRun:          PropTypes.func,
}

export default VisualizationResult;
