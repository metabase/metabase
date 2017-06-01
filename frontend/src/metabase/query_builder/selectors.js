
import { createSelector } from "reselect";
import _ from "underscore";

import { getParametersWithExtras } from "metabase/meta/Card";

import { isCardDirty, isCardRunnable } from "metabase/lib/card";
import Utils from "metabase/lib/utils";

import { getIn } from "icepick";

import { getMetadata, getDatabasesList } from "metabase/selectors/metadata";

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

export const getTableId = createSelector(
    [getCard],
    (card) => getIn(card, ["dataset_query", "query", "source_table"])
);

export const getTableForeignKeys          = state => state.qb.tableForeignKeys;
export const getTableForeignKeyReferences = state => state.qb.tableForeignKeyReferences;

export const getTables = createSelector(
    [getDatabaseId, getDatabasesList],
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
    [getDatabasesList],
    (databases) =>
        databases && databases.filter(db => db.native_permissions === "write")
)

export const getTableMetadata = createSelector(
    [getTableId, getMetadata],
    (tableId, metadata) => metadata.tables[tableId]
)

export const getSampleDatasetId = createSelector(
    [getDatabasesList],
    (databases) => {
        const sampleDataset = _.findWhere(databases, { is_sample: true });
        return sampleDataset && sampleDataset.id;
    }
)

export const getDatabaseFields = createSelector(
    [getDatabaseId, state => state.qb.databaseFields],
    (databaseId, databaseFields) => databaseFields[databaseId]
);



import { getMode as getMode_ } from "metabase/qb/lib/modes";

export const getMode = createSelector(
    [getLastRunCard, getTableMetadata],
    (card, tableMetadata) => getMode_(card, tableMetadata)
)

export const getIsObjectDetail = createSelector(
    [getMode],
    (mode) => mode && mode.name === "object"
);

export const getParameters = createSelector(
    [getCard, getParameterValues],
    (card, parameterValues) => getParametersWithExtras(card, parameterValues)
);

export const getIsRunnable = createSelector(
    [getCard, getTableMetadata],
    (card, tableMetadata) => isCardRunnable(card, tableMetadata)
)

const getLastRunDatasetQuery = createSelector([getLastRunCard], (card) => card && card.dataset_query);
const getNextRunDatasetQuery = createSelector([getCard], (card) => card && card.dataset_query);

const getLastRunParameters = createSelector([getQueryResult], (queryResult) => queryResult && queryResult.json_query && queryResult.json_query.parameters || []);
const getLastRunParameterValues = createSelector([getLastRunParameters], (parameters) => parameters.map(parameter => parameter.value));
const getNextRunParameterValues = createSelector([getParameters], (parameters) =>
    parameters.map(parameter => parameter.value).filter(p => p !== undefined)
);

export const getIsResultDirty = createSelector(
    [getLastRunDatasetQuery, getNextRunDatasetQuery, getLastRunParameterValues, getNextRunParameterValues],
    (lastDatasetQuery, nextDatasetQuery, lastParameters, nextParameters) => {
        return !Utils.equals(lastDatasetQuery, nextDatasetQuery) || !Utils.equals(lastParameters, nextParameters);
    }
);
