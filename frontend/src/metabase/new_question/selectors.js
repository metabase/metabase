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

const getCurrentStepIndex = state => state.newQuestion.currentStepIndex;

const getFlowSteps = state => state.newQuestion.flow.steps;

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

export const getBreakoutsForFlow = createSelector(
    [getCurrentFlowType, getSelectedTable],
    (flowType, selectedTable) => {
        console.log(selectedTable);
        const fields = Object.values(selectedTable.fields_lookup);
        switch (flowType) {
            case "timeseries":
                return fields.filter(field => isDate(field));
            case "map":
                return fields.filter(field => isDate(field));
            default:
                return fields;
        }
    }
);

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
    return {
        date: fields.filter(f => isDate(f)),
        number: fields.filter(f => isNumber(f)),
        category: fields.filter(f => isCategory(f))
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
        }
    ];
};

import Query from "metabase/lib/query";

const FIELD_FILTERS_BY_FLOW_TYPE = {
    timeseries: isDate,
    map: field => isCountry(field) || isState(field),
    default: () => true
};

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
                case "map":
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
    [getCurrentFlowType, getMetrics, getTables, getFields],
    (currentFlowType, metrics, tables, fields) => {
        let fieldFilter = FIELD_FILTERS_BY_FLOW_TYPE[currentFlowType] ||
            FIELD_FILTERS_BY_FLOW_TYPE["default"];
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
