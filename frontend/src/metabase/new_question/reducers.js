import {
    ADD_BREAKOUT_STEP,
    ADVANCE_STEP,
    BACK,
    NEW_METRIC,
    RESET_NEW_QUESTION_FLOW,
    SELECT_FLOW,
    SET_DATABASE,
    SET_TABLE,
    SET_AGGREGATION,
    SET_MAP,
    SET_TIP,
    SELECT_METRIC,
    SELECT_METRIC_BREAKOUT
} from "./actions";

import QueryTypeList from "./components/QueryTypeList";

import MetricLanding from "./containers/MetricLanding";
import MetricBuilderDatabases from "./containers/MetricBuilderDatabases";
import MetricBuilderSchemas from "./containers/MetricBuilderSchemas";
import MetricBuilderTables from "./containers/MetricBuilderTables";
import MetricBuilderAggregation from "./containers/MetricBuilderAggregation";

import MapLanding from "./containers/MapLanding";
import BreakoutSelection from "./containers/BreakoutSelection";
import PivotSelection from "./containers/PivotSelection";

import tips from "./tips";

import { assocIn, chain } from "icepick";

const breakoutStep = {
    title: "How do you want to see this metric?",
    component: BreakoutSelection,
    tip: tips["breakout"]
};

const initialStep = {
    subtitle: state => {
        return `What would you like to see ${state.currentUser.first_name}?`;
    },
    component: QueryTypeList,
    tip: tips["start"],
    back: false
};

const metricTitle = "Metrics";

const metric = [
    {
        title: "Pick a metric",
        component: MetricLanding,
        tip: tips["metric"],
        skip: {
            resource: 'metrics',
            resolve: metrics => metrics.length > 0
        }
    },
    breakoutStep
];

const newMetricSteps = [
    {
        title: "Pick a database",
        component: MetricBuilderDatabases,
        tip: tips["database"],
        skip: {
            resource: "databases",
            resolve: databases => databases.length > 0
        }
    },
    /*
    {
        title: "Pick a schema",
        component: MetricBuilderSchemas,
        tip: tips["schemas"],
        skip: {
            resource: 'schemas',
            resolve: (schemas) => schemas.length > 0
        }
    },
    */
    {
        title: "Pick a table",
        component: MetricBuilderTables,
        tip: tips["tables"],
        skip: false
    },
    {
        title: "Pick an aggregation",
        component: MetricBuilderAggregation,
        tip: tips["tables"],
        skip: false
    }
];

const segmentTitle = "View a segment or table";
const segment = newMetricSteps;

const geoTitle = "Metric on a map";
const geo = [
    {
        title: "What kind of map would you like to see?",
        component: MapLanding
    },
    {
        title: geoTitle,
        component: MetricLanding,
        tip: tips["metric"],
        skip: {
            resource: 'metrics',
            resolve: metrics => metrics.length > 0
        }
    },
    breakoutStep
];

const pivotTitle = "Pivot a metric";
const pivot = [
    {
        title: pivotTitle,
        component: MetricLanding,
        tip: tips["metric"],
        skip: {
            resource: 'metrics',
            resolve: metrics => metrics.length > 0
        }
    },
    {
        title: pivotTitle,
        component: PivotSelection
    }
];

const timeSeriesTitle = "A metric as a timeseries";
const timeseries = [
    {
        title: "What metric do you want for your timeseries?",
        component: MetricLanding,
        tip: tips["metric"]
    },
    breakoutStep
];

const titles = {
    geo: geoTitle,
    metric: metricTitle,
    pivot: pivotTitle,
    segment: segmentTitle,
    timeseries: timeSeriesTitle
};

const flows = {
    metric,
    geo,
    pivot,
    segment,
    timeseries
};

const setVizForFlow = flow => {
    switch (flow) {
        case "timeseries":
            return "line";
        case "geo":
            return "map";
        case "pivot":
        case "segment":
            return "table";
        default:
            return false;
    }
};

const initialState = {
    currentStep: initialStep,
    flow: { title: "Start with..." },
    currentStepIndex: 0,
    card: {}
};

export default function(state = initialState, { type, payload, error }) {
    const { currentStepIndex, flow } = state;
    switch (type) {
        case RESET_NEW_QUESTION_FLOW:
            return initialState;
        case SET_TIP:
            return {
                ...state,
                currentStep: {
                    ...state.currentStep,
                    tip: payload
                }
            };
        case SELECT_METRIC:
            return chain(state)
                .assocIn(["card", "display"], setVizForFlow(state.flow.type))
                .assocIn(["card", "dataset_query", "type"], "query")
                .assocIn(["card", "dataset_query", "database"], payload.database_id)
                .assocIn(["card", "dataset_query", "query", "source_table"], payload.table_id)
                .assocIn(["card", "dataset_query", "query", "aggregation"], [["METRIC", payload.id]])
                .value();
        case SELECT_METRIC_BREAKOUT:
            return {
                ...state,
                card: {
                    ...state.card,
                    dataset_query: {
                        ...state.card.dataset_query,
                        query: {
                            ...state.card.dataset_query.query,
                            breakout: [payload]
                        }
                    },
                    display: setVizForFlow(state.flow.type)
                }
            };
        case BACK:
            // TODO - hey, so if I go back, what happens to the query dict
            const newStepIndex = currentStepIndex - 1;

            // if the currentStepIndex is 0 then we're back at the beginning and
            // we should just reset
            if (currentStepIndex === 0) {
                return initialState;
            }

            return {
                ...state,
                currentStep: state.flow.steps[newStepIndex],
                currentStepIndex: newStepIndex
            };
        case NEW_METRIC:
            return {
                ...state,
                newMetric: true,
                currentStep: newMetricSteps[0],
                flow: {
                    ...state.flow,
                    steps: newMetricSteps
                }
            };
        case ADVANCE_STEP:
            return {
                ...state,
                currentStep: state.flow.steps[currentStepIndex + 1],
                currentStepIndex: currentStepIndex + 1
            };
        case SET_TABLE:
            return {
                ...state,
                card: {
                    ...state.card,
                    dataset_query: {
                        ...state.card.dataset_query,
                        query: {
                            ...state.card.dataset_query.query,
                            source_table: payload
                        }
                    }
                }
            };
        case SET_AGGREGATION:
            return {
                ...state,
                card: {
                    ...state.card,
                    dataset_query: {
                        ...state.card.dataset_query,
                        query: {
                            ...state.card.dataset_query.query,
                            aggregation: payload
                        }
                    }
                }
            };
        case ADD_BREAKOUT_STEP:
            return {
                ...state,
                flow: {
                    ...state.flow,
                    steps: state.flow.steps.concat([breakoutStep])
                }
            };
        case SET_DATABASE:
            return {
                ...state,
                card: {
                    ...state.card,
                    ...payload
                }
            };
        case SET_MAP:
        return assocIn(state, ["card", "visualization_settings"], {
            "map.region": payload,
            "map.type": "region"
        })
        case SELECT_FLOW:
            return {
                ...state,
                flow: {
                    type: payload,
                    title: titles[payload],
                    steps: flows[payload]
                },
                currentStep: flows[payload][state.currentStepIndex],
                card: {
                    ...state.card,
                    display: setVizForFlow(payload)
                }
            };
        default:
            return state;
    }
}
