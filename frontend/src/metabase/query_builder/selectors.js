
import { createSelector } from "reselect";
import _ from "underscore";

import { getTemplateTags } from "metabase/meta/Card";
import { getTemplateTagParameters } from "metabase/meta/Parameter";

import { isCardDirty, isCardRunnable } from "metabase/lib/card";
import { parseFieldTargetId } from "metabase/lib/query_time";
import { isPK } from "metabase/lib/types";
import Query from "metabase/lib/query";
import Utils from "metabase/lib/utils";

export const getUiControls      = state => state.qb.uiControls;

export const getCard            = state => state.qb.card;
export const getOriginalCard    = state => state.qb.originalCard;
export const getLastRunCard     = state => state.qb.lastRunCard;

export const getParameterValues = state => state.qb.parameterValues;
export const getQueryResult     = state => state.qb.queryResult;

export const getIsDirty = createSelector(
    [getCard, getOriginalCard],
    (card, originalCard) => {
        return isCardDirty(card, originalCard);
    }
);

export const getIsNew = (state) => state.qb.card && !state.qb.card.id;

export const getDatabaseId = createSelector(
    [getCard],
    (card) => card && card.dataset_query && card.dataset_query.database
);

export const getDatabases                 = state => state.qb.databases;
export const getTableForeignKeys          = state => state.qb.tableForeignKeys;
export const getTableForeignKeyReferences = state => state.qb.tableForeignKeyReferences;

export const getTables = createSelector(
    [getDatabaseId, getDatabases],
    (databaseId, databases) => {
        if (databaseId != null && databases && databases.length > 0) {
            let db = _.findWhere(databases, { id: databaseId });
            if (db && db.tables) {
                return db.tables;
            }
        }

        return [];
    }
);

export const getNativeDatabases = createSelector(
    [getDatabases],
    (databases) =>
        databases && databases.filter(db => db.native_permissions === "write")
)

export const getTableMetadata = createSelector(
    [state => state.qb.tableMetadata, getDatabases],
    (tableMetadata, databases) => tableMetadata && {
        ...tableMetadata,
        db: _.findWhere(databases, { id: tableMetadata.db_id })
    }
)

export const getSampleDatasetId = createSelector(
    [getDatabases],
    (databases) => {
        const sampleDataset = _.findWhere(databases, { is_sample: true });
        return sampleDataset && sampleDataset.id;
    }
)

export const getDatabaseFields = createSelector(
    [getDatabaseId, state => state.qb.databaseFields],
    (databaseId, databaseFields) => databaseFields[databaseId]
);

export const getIsObjectDetail = createSelector(
    [getQueryResult],
    (queryResult) => {
        if (!queryResult || !queryResult.json_query) {
            return false;
        }

        const data = queryResult.data,
              dataset_query = queryResult.json_query;

        let response = false;

        // NOTE: we specifically use only the query result here because we don't want the state of the
        //       visualization being shown (Object Details) to change as the query/card changes.

        // "rows" type query w/ an '=' filter against the PK column
        if (dataset_query.query &&
                dataset_query.query.source_table &&
                dataset_query.query.filter &&
                Query.isBareRows(dataset_query.query) &&
                data.rows &&
                data.rows.length === 1) {

            // we need to know the PK field of the table that was queried, so find that now
            let pkField;
            for (var i=0; i < data.cols.length; i++) {
                let coldef = data.cols[i];
                if (coldef.table_id === dataset_query.query.source_table && isPK(coldef.special_type)) {
                    pkField = coldef.id;
                }
            }

            // now check that we have a filter clause w/ '=' filter on PK column
            if (pkField !== undefined) {
                for (const filter of Query.getFilters(dataset_query.query)) {
                    if (Array.isArray(filter) &&
                            filter.length === 3 &&
                            filter[0] === "=" &&
                               parseFieldTargetId(filter[1]) === pkField &&
                            filter[2] !== null) {
                        // well, all of our conditions have passed so we have an object detail query here
                        response = true;
                    }
                }
            }
        }

        return response;
    }
);



import { getMode as getMode_ } from "metabase/qb/lib/modes";

export const getMode = createSelector(
    [getLastRunCard, getTableMetadata],
    (card, tableMetadata) => getMode_(card, tableMetadata)
)

export const getImplicitParameters = createSelector(
    [getCard],
    (card) =>
        getTemplateTagParameters(getTemplateTags(card))
);

export const getModeParameters = createSelector(
    [getLastRunCard, getTableMetadata, getMode],
    (card, tableMetadata, mode) =>
        (card && tableMetadata && mode && mode.getModeParameters) ?
            mode.getModeParameters(card, tableMetadata) :
            []
);

export const getParameters = createSelector(
    [getModeParameters, getImplicitParameters],
    (modeParameters, implicitParameters) => [...modeParameters, ...implicitParameters]
);

export const getParametersWithValues = createSelector(
    [getParameters, getParameterValues],
    (parameters, values) =>
        parameters.map(parameter => ({
            ...parameter,
            value: values[parameter.id] != null ? values[parameter.id] : null
        }))
);

export const getIsRunnable = createSelector(
    [getCard, getTableMetadata],
    (card, tableMetadata) => isCardRunnable(card, tableMetadata)
)

const getLastRunDatasetQuery = createSelector([getLastRunCard], (card) => card && card.dataset_query);
const getNextRunDatasetQuery = createSelector([getCard], (card) => card && card.dataset_query);

const getLastRunParameters = createSelector([getQueryResult], (queryResult) => queryResult && queryResult.json_query.parameters || [])
const getLastRunParameterValues = createSelector([getLastRunParameters], (parameters) => parameters.map(parameter => parameter.value))
const getNextRunParameterValues = createSelector([getParametersWithValues], (parameters) => parameters.map(parameter => parameter.value))

export const getIsResultDirty = createSelector(
    [getLastRunDatasetQuery, getNextRunDatasetQuery, getLastRunParameterValues, getNextRunParameterValues],
    (lastDatasetQuery, nextDatasetQuery, lastParameters, nextParameters) => {
        return !Utils.equals(lastDatasetQuery, nextDatasetQuery) || !Utils.equals(lastParameters, nextParameters);
    }
)
