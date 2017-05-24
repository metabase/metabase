import React from "react";
import _ from "underscore";

import {getCardColors} from "metabase/visualizations/lib/utils";
import MetricWidget from "metabase/query_builder/components/MetricWidget";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import AddMetricModal from "metabase/query_builder/components/AddMetricModal";
import Tooltip from "metabase/components/Tooltip";
import AddButton from "metabase/components/AddButton";

// TODO: Containerize this component in order to reduce the props passing in QB
const MetricList = ({...props}) => {
    const { card, query, setDatasetQuery, tableMetadata, hideAddButton, hideClearButton } = props;

    const aggregations = query.aggregations();
    const metricColors = getCardColors(card);

    const showAddMetricButton = !hideAddButton && !query.isBareRows();
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
                    index={index}
                    query={query}
                    updateQuery={setDatasetQuery}
                    clearable={!hideClearButton}
                    color={metricColors[index]}
                />
            )}
            {showAddMetricButton && addMetricButton}
        </div>
    )
};

export default MetricList;
