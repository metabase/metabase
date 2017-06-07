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
    const { question, setDatasetQuery, hideAddButton, hideClearButton } = props;

    const metrics = question.singleQueries();
    const metricColors = getCardColors(question.card());

    const showAddMetricButton = !hideAddButton;
    const canAddMetricToVisualization = _.contains(["line", "area", "bar"], question.display());
    const metricsAreRemovable = !hideClearButton && question.canRemoveMetric();

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
            <AddMetricModal {...props} />
        </ModalWithTrigger>;

    return (
        <div className="align-center flex flex-full">
            { metrics.map((metric, index) =>
                <MetricWidget
                    key={"metric" + index}
                    question={question}
                    metric={metric}
                    metricIndex={index}
                    setDatasetQuery={setDatasetQuery}
                    clearable={metricsAreRemovable}
                    color={metricColors[index]}
                />
            )}
            {showAddMetricButton && addMetricButton}
        </div>
    )
};

export default MetricList;
