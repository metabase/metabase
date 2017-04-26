import { getIn } from "icepick";
import { getFieldValues } from "metabase/lib/query/field";

export const getTables = (state) => state.metadata.tables;
export const getFields = (state) => state.metadata.fields;
export const getMetrics = (state) => state.metadata.metrics;
export const getDatabases = (state) => Object.values(state.metadata.databases);

export const getParameterFieldValues = (state, props) => {
    return getFieldValues(getIn(state, ["metadata", "fields", props.parameter.field_id, "values"]));
}
