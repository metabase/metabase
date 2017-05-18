import React from "react";
import _ from "underscore";

import {getCardColors} from "metabase/visualizations/lib/utils";
import * as Query from "metabase/lib/query/query";
import MetricWidget from "metabase/query_builder/components/MetricWidget";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import AddMetricModal from "metabase/query_builder/components/AddMetricModal";
import Tooltip from "metabase/components/Tooltip";
import AddButton from "metabase/components/AddButton";

// At the moment this inherits all CardBuilder props
const MetricList = ({...props}) => {
    const { card, datasetQuery: { query }, tableMetadata, supportMultipleAggregations, hideAddButton } = props;

    const metricColors = getCardColors(card);

    let isBareRows = Query.isBareRows(query);
    let aggregations = Query.getAggregations(query);

    if (aggregations.length === 0) {
        // add implicit rows aggregation
        aggregations.push(["rows"]);
    }

    const canRemoveAggregation = aggregations.length > 1;

    let aggregationList = [];
    for (const [index, aggregation] of aggregations.entries()) {
        aggregationList.push(
            <MetricWidget
                key={"agg" + index}
                aggregation={aggregation}
                tableMetadata={tableMetadata}
                customFields={Query.getExpressions(props.datasetQuery.query)}
                updateAggregation={(aggregation) => props.updateQueryAggregation(index, aggregation)}
                removeAggregation={canRemoveAggregation ? props.removeQueryAggregation.bind(null, index) : null}
                // TODO Get rid of this placeholder parameter
                addMetric={() => { }}
                clearable
                color={metricColors[index]}
            />
        );
    }

    if (!hideAddButton && supportMultipleAggregations && !isBareRows) {
        const canAddMetricToVisualization = _.contains(["line", "area", "bar"], props.card.display);

        aggregationList.push(
            <ModalWithTrigger
                full
                disabled={!canAddMetricToVisualization}
                triggerElement={
                    <Tooltip
                        key="addmetric"
                        tooltip={canAddMetricToVisualization ? "Add metric" : "In proto you can only add metrics to line/area/bar visualizations"}
                    >
                        <AddButton />
                    </Tooltip>
                }
            >
                <AddMetricModal tableMetadata={tableMetadata} {...props} />
            </ModalWithTrigger>
        );
    }

    return <div className="align-center flex flex-full">{aggregationList}</div>;
};

export default MetricList;
