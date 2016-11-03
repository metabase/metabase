
import { createAction, createThunkAction, handleActions, combineReducers } from "metabase/lib/redux";
import { merge } from "icepick"
import { TYPE, isa } from "metabase/lib/types";
import _ from "underscore";

import { MetabaseApi } from "metabase/services";

const REQUEST_ENTITY_NAMES = "entitynames/REQUEST_ENTITY_NAMES";
const FETCH_ENTITY_NAMES = "entitynames/FETCH_ENTITY_NAMES";

// HACK: suuuuuper hacky way to get the field metadata from the qb redux sttate.
// we should be using a more central/normalized metadata store
function getField({ qb: { tableMetadata } }, fieldId) {
    let field = tableMetadata.fields_lookup[fieldId];
    if (field) {
        return {
            ...field,
            table: tableMetadata
        };
    }
    let fkField = _.find(tableMetadata.fields, (f) => f.target && f.target.id === fieldId);
    if (fkField) {
        return fkField.target;
    }
}

export const fetchEntityNames = createAction(FETCH_ENTITY_NAMES, ({ dbId, tableId, entityIdFieldId, entityNameFieldId, entityIds }) =>
    MetabaseApi.dataset({
        database: dbId,
        type: "query",
        query: {
            source_table: tableId,
            filter: ["=", entityIdFieldId, ...entityIds],
            fields: [entityIdFieldId, entityNameFieldId]
        }
    })
);

export const requestEntityNames = createThunkAction(REQUEST_ENTITY_NAMES, (requestsByFieldId) =>
    async (dispatch, getState) => {
        const { entitynames: { entitiesByField }} = getState();
        const entityNames = {};
        for (let fieldId in requestsByFieldId) {
            fieldId = parseInt(fieldId);
            const entityIds = Object.keys(requestsByFieldId[fieldId]);
            const entityIdField = getField(getState(), fieldId);
            const entityNameField = _.find(entityIdField && entityIdField.table.fields, (f) => isa(f.special_type, TYPE.Name));
            const newEntityIds = entityIds.filter(entityId =>
                !entitiesByField[fieldId] || !entitiesByField[fieldId][entityId]
            );
            if (entityIdField && entityNameField && newEntityIds.length > 0) {
                dispatch(fetchEntityNames({
                    dbId: entityIdField.table.db_id,
                    tableId: entityIdField.table_id,
                    entityIdFieldId: entityIdField.id,
                    entityNameFieldId: entityNameField.id,
                    entityIds: entityIds
                }));
                entityNames[fieldId] = newEntityIds.reduce((o, id) => ({...o, [id]: { state: "loading" }}), {});
            } else {
                entityNames[fieldId] = entityIds.reduce((o, id) => ({...o, [id]: { state: "error" }}), {});
            }
        }
        return entityNames;
    }
);

// extract entity names from a dataset response
function extractEntityNames(data) {
    const entityNames = {};
    // TODO: what if there's more than one entity id or entity name?
    const entityIdIndex = _.findIndex(data.cols, (col) => isa(col.special_type, TYPE.PK));
    const entityNameIndex = _.findIndex(data.cols, (col) => isa(col.special_type, TYPE.Name));
    if (entityIdIndex >= 0 && entityNameIndex >= 0) {
        const entityIdColumn = data.cols[entityIdIndex];
        entityNames[entityIdColumn.id] = {};
        for (const row of data.rows) {
            const entityId = row[entityIdIndex];
            const entityName = row[entityNameIndex];
            entityNames[entityIdColumn.id][entityId] = { state: "loaded", name: entityName };
        }
    }
    return entityNames;
}

const entitiesByField = handleActions({
    [REQUEST_ENTITY_NAMES]: (state, { payload }) => {
        return merge(state, payload);
    },
    [FETCH_ENTITY_NAMES]: (state, { payload }) => {
        if (payload) {
            return merge(state, extractEntityNames(payload.data));
        }
        return state;
    },
    // scrape entity id/name pairs from qb queries as well
    ["QUERY_COMPLETED"]: (state, { payload }) => {
        let data = payload && payload.queryResult && payload.queryResult.data;
        if (data) {
            return merge(state, extractEntityNames(data));
        }
        return state;
    }
}, {});

export default combineReducers({
    entitiesByField
})
