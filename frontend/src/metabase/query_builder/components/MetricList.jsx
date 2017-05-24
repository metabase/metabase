import React from "react";
import _ from "underscore";

import {getCardColors} from "metabase/visualizations/lib/utils";
import * as Query from "metabase/lib/query/query";
import MetricWidget from "metabase/query_builder/components/MetricWidget";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import AddMetricModal from "metabase/query_builder/components/AddMetricModal";
import Tooltip from "metabase/components/Tooltip";
import AddButton from "metabase/components/AddButton";

// TODO: Containerize this component to reduce the props passing in QB
const MetricList = ({...props}) => {
    const { card, datasetQuery: { query }, tableMetadata, hideAddButton, hideClearButton } = props;

    const aggregations = Query.getAggregations(query);
    const metricColors = getCardColors(card);

    const isBareRows = Query.isBareRows(query);
    const canRemoveAggregation = aggregations.length > 1;
    const showAddMetricButton = !hideAddButton && !isBareRows;
    const canAddMetricToVisualization = _.contains(["line", "area", "bar"], props.card.display);

    const addMetricButton =
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
        </ModalWithTrigger>;

    return (
        <div className="align-center flex flex-full">
            { [...aggregations.entries()].map(([index, aggregation]) =>
                <MetricWidget
                    key={"agg" + index}
                    aggregation={aggregation}
                    tableMetadata={tableMetadata}
                    customFields={Query.getExpressions(props.datasetQuery.query)}
                    updateMetric={(aggregation) => props.updateQueryAggregation(index, aggregation)}
                    removeMetric={canRemoveAggregation ? props.removeQueryAggregation.bind(null, index) : null}
                    clearable={!hideClearButton}
                    color={metricColors[index]}
                />
            )}
            {showAddMetricButton && addMetricButton}
        </div>
    )
};

export default MetricList;
