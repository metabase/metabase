/* eslint "react/prop-types": "warn" */

import React, { PropTypes } from "react";
import QueryVisualizationObjectDetailTable from './QueryVisualizationObjectDetailTable.jsx';
import VisualizationErrorMessage from './VisualizationErrorMessage';
import Visualization from "metabase/visualizations/components/Visualization.jsx";

const VisualizationResult = ({card, isObjectDetail, lastRunDatasetQuery, result, ...rest}) => {
    if (isObjectDetail) {
        return <QueryVisualizationObjectDetailTable data={result.data} {...rest} />
    } else if (result.data.rows.length === 0) {
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
        let vizCard = {
            ...card,
            dataset_query: lastRunDatasetQuery
        };
        return <Visualization
                  className="full"
                  series={[{ card: vizCard, data: result.data }]}
                  isEditing={true}
                  // Table:
                  {...rest}
              />
    }
}

VisualizationResult.propTypes = {
    card:                   PropTypes.object.isRequired,
    isObjectDetail:         PropTypes.bool.isRequired,
    lastRunDatasetQuery:    PropTypes.object.isRequired,
    result:                 PropTypes.object.isRequired,
}

export default VisualizationResult;
