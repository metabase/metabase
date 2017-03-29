import {
    isDate,
    isNumber,
    isCategory,
    isCountry,
    isState
} from "metabase/lib/schema_metadata";

import { normal } from "metabase/lib/colors";

import { createSelector } from "reselect";
import { getTables, getMetrics, getFields } from "metabase/selectors/metadata";

export const getCurrentStep = state => state.newQuestion.currentStep;

export const getBack = createSelector(
    [getCurrentStep],
    (currentStep) => {
        console.log(currentStep)
        if(currentStep.hasOwnProperty('back')) {
            return currentStep.back
        }
        return true
    }
);

export const getCurrentStepComponent = createSelector(
    [getCurrentStep],
    (currentStep) => currentStep.component
)

export const getCurrentStepTip = createSelector(
    [getCurrentStep],
    (currentStep) => currentStep.tip
)

const getCurrentStepIndex = state => state.newQuestion.currentStepIndex;
const getCurrentFlow = state => state.newQuestion.flow;

const getFlowSteps = createSelector(
    [getCurrentFlow],
    (flow) => flow.steps
);

export const getNextStep = createSelector(
    [getCurrentStepIndex, getFlowSteps],
    (currentStepIndex, flowSteps) => flowSteps[currentStepIndex + 1]
);

export const getResource = (resource, state) => state.metadata[resource];

export const currentTip = createSelector(
    [getCurrentStep],
    currentStep => currentStep.tip
);

export const currentStepTitle = createSelector(
    [getCurrentStep],
    currentStep => currentStep.title
);

// TODO this is a hellscape, not meant for human eyes to see
export const getSelectedTable = state => {
    if (
        state.newQuestion.card.dataset_query &&
        state.newQuestion.card.dataset_query.query
    ) {
        return state.newQuestion.card.dataset_query.query.source_table;
    }
    return null;
};

export const getSelectedTableMetadata = createSelector(
    [getSelectedTable, getTables],
    (selectedTable, tables) => {
        const table = selectedTable != null ? tables[selectedTable] : null;
        if (table) {
            return {
                ...table,
                fields: table.fields.map(
                    fieldId => table.fields_lookup[fieldId]
                )
            };
        } else {
            return null;
        }
    }
);

export const getCurrentFlowType = state => state.newQuestion.flow.type;

const getGeoFieldFilter = (state) => {
    const settings = state.newQuestion.card.visualization_settings;
    return settings && MAP_FILTERS[settings["map.region"]] || (() => false);
}

export const getFieldFilterForFlow = createSelector(
    [getCurrentFlowType, getGeoFieldFilter],
    (flowType, isGeo) => {
    switch (flowType) {
        case "timeseries":
            return isDate
        case "geo":
            return isGeo
        default:
            return () => true;
    }
});

export const getBreakoutsForFlow = createSelector(
    [getCurrentFlowType, getSelectedTable, getFieldFilterForFlow],
    (flowType, selectedTable, fieldFilter) => {
        return Object.values(selectedTable.fields_lookup).filter(fieldFilter);
    }
);

const MAP_FILTERS = {
    "us_states": isState,
    "world_countries": isCountry,
}

export const getTablesByMapType = createSelector(
    [getFields],
    (fields) => {
        const tablesByMapType = {};
        for (const fieldId in fields) {
            const field = fields[fieldId];
            for (const mapType in MAP_FILTERS) {
                if (MAP_FILTERS[mapType](field)) {
                    if (!tablesByMapType[mapType]) {
                        tablesByMapType[mapType] = new Set
                    }
                    tablesByMapType[mapType].add(field.table_id);
                }
            }
        }
        for (const mapType in tablesByMapType) {
            tablesByMapType[mapType] = Array.from(tablesByMapType[mapType]);
        }
        return tablesByMapType;
    }
)

export const getSubtitle = state => {
    const subtitle = state.newQuestion.currentStep.subtitle;
    if (typeof subtitle === "function") {
        return subtitle(state);
    }
    return subtitle;
};

export const breakoutsByCategory = state => {
    const rawFields = state.metadata.tables[
        getSelectedTable(state)
    ].fields_lookup;
    const fields = Object.keys(rawFields).map(field => rawFields[field]);
    const isMap = getGeoFieldFilter(state);
    return {
        date: fields.filter(isDate),
        number: fields.filter(isNumber),
        category: fields.filter(isCategory),
        geo: fields.filter(isMap)
    };
};

export const getMetricsForCurrentTable = createSelector(
    [getSelectedTable, state => state.metadata.metrics],
    (tableId, metrics) =>
        Object.values(metrics).filter(metric => metric.table_id === tableId)
);

export const breakoutsForDisplay = state => {
    const categories = breakoutsByCategory(state);
    const flow = getCurrentFlowType(state);

    return [
        {
            display_name: "Dates",
            fields: categories["date"],
            displayColor: normal.blue,
            iconName: "calendar",
            show: () => flow === "timeseries"
        },
        {
            display_name: "Numbers",
            fields: categories["number"],
            displayColor: normal.green,
            iconName: "int",
            show: () => flow === "metric"
        },
        {
            display_name: "Categories",
            fields: categories["category"],
            displayColor: normal.indigo,
            iconName: "label",
            show: () => flow === "metric"
        },
        {
            display_name: "Map",
            fields: categories["geo"],
            displayColor: normal.indigo,
            iconName: "label",
            show: () => flow === "geo"
        }
    ];
};

import Query from "metabase/lib/query";

export const getFieldsForMetric = createSelector(
    [getCurrentFlowType],
    currentFlowType => {
        return currentFlowType;
    }
);

export const getTablesForDatabase = state =>
    Object.values(
        state.metadata.databases[
            state.newQuestion.card.dataset_query.database
        ].tables_lookup
    );

export const getTablesForFlow = createSelector(
    [getTablesForDatabase, getCurrentFlowType],
    (tables, flowType) => tables.filter(table => {
        const fields = Object.values(table.fields_lookup).filter(field => {
            switch (flowType) {
                case "timeseries":
                    return isDate(field);
                case "geo":
                    // TODO
                    return field;
                default:
                    return field;
            }
        });
        if (fields.length > 0) {
            return table;
        }
    })
);

export const getMetricsForCurrentFlow = createSelector(
    [getCurrentFlowType, getMetrics, getTables, getFields, getFieldFilterForFlow],
    (currentFlowType, metrics, tables, fields, fieldFilter) => {
        return Object.values(metrics).filter(metric => {
            const tableMetadata = tables[metric.table_id];
            const fieldOptions = Query.getFieldOptions(
                tableMetadata.fields.map(fieldId => fields[fieldId]),
                true,
                fields =>
                    tableMetadata.breakout_options
                        .validFieldsFilter(fields)
                        .filter(fieldFilter)
            );
            return fieldOptions.count > 0;
        });
    }
);
