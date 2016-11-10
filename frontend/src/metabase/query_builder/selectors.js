
import { createSelector } from "reselect";
import _ from "underscore";

import { getTemplateTags } from "metabase/meta/Card";

import { isCardDirty, isCardRunnable } from "metabase/lib/card";
import * as DataGrid from "metabase/lib/data_grid";
import Query from "metabase/lib/query";
import { parseFieldTarget } from "metabase/lib/query_time";
import { isPK } from "metabase/lib/types";
import { applyParameters } from "metabase/meta/Card";

export const uiControls                = state => state.qb.uiControls;

export const card                      = state => state.qb.card;
export const originalCard              = state => state.qb.originalCard;
export const parameterValues           = state => state.qb.parameterValues;

export const isDirty = createSelector(
	[card, originalCard],
	(card, originalCard) => {
		return isCardDirty(card, originalCard);
	}
);

export const isNew = (state) => state.qb.card && !state.qb.card.id;

export const getDatabaseId = createSelector(
	[card],
	(card) => card && card.dataset_query && card.dataset_query.database
);

export const databases                 = state => state.qb.databases;
export const tableForeignKeys          = state => state.qb.tableForeignKeys;
export const tableForeignKeyReferences = state => state.qb.tableForeignKeyReferences;

export const tables = createSelector(
	[getDatabaseId, databases],
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
	databases,
	(databases) =>
		databases && databases.filter(db => db.native_permissions === "write")
)

export const tableMetadata = createSelector(
	state => state.qb.tableMetadata,
	databases,
	(tableMetadata, databases) => tableMetadata && {
		...tableMetadata,
		db: _.findWhere(databases, { id: tableMetadata.db_id })
	}
)

export const getSampleDatasetId = createSelector(
	[databases],
	(databases) => {
		const sampleDataset = _.findWhere(databases, { is_sample: true });
		return sampleDataset && sampleDataset.id;
	}
)

export const getDatabaseFields = createSelector(
	[getDatabaseId, state => state.qb.databaseFields],
	(databaseId, databaseFields) => databaseFields[databaseId]
);

export const isObjectDetail = createSelector(
	[state => state.qb.queryResult],
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
   	                        parseFieldTarget(filter[1]) === pkField &&
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

export const queryResult = createSelector(
	[state => state.qb.queryResult, isObjectDetail],
	(queryResult, isObjectDetail) => {
		// if we are display bare rows, filter out columns with visibility_type = details-only
        if (queryResult && queryResult.json_query && !isObjectDetail &&
        		Query.isStructured(queryResult.json_query) &&
                Query.isBareRows(queryResult.json_query.query)) {
        	// TODO: mutability?
            queryResult.data = DataGrid.filterOnPreviewDisplay(queryResult.data);
        }

        return queryResult;
	}
);

export const getImplicitParameters = createSelector(
	[card, parameterValues],
	(card, parameterValues) =>
		getTemplateTags(card)
			.filter(tag => tag.type != null && tag.type !== "dimension")
			.map(tag => ({
				id: tag.id,
				type: tag.type === "date" ? "date/single" : "category",
				name: tag.display_name,
				value: parameterValues[tag.id] != null ? parameterValues[tag.id] : tag.default,
				default: tag.default
			}))
);

export const getParameters = createSelector(
	[getImplicitParameters],
	(implicitParameters) => implicitParameters
);

export const getFullDatasetQuery = createSelector(
	[card, getParameters, parameterValues],
	(card, parameters, parameterValues) =>
		card && applyParameters(card, parameters, parameterValues)
)

export const getIsRunnable = createSelector(
	[card],
	(card) => isCardRunnable(card)
)
