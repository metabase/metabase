
import { createSelector } from "reselect";
import _ from "underscore";

import { isCardDirty } from "metabase/lib/card";
import * as DataGrid from "metabase/lib/data_grid";
import Query from "metabase/lib/query";


export const uiControls                = state => state.uiControls;

export const card                      = state => state.card;
export const originalCard              = state => state.originalCard;
export const isDirty = createSelector(
	[card, originalCard],
	(card, originalCard) => {
		return isCardDirty(card, originalCard);
	}
);

export const databases                 = state => state.databases;
export const tableMetadata             = state => state.tableMetadata;
export const tableForeignKeys          = state => state.tableForeignKeys;
export const tableForeignKeyReferences = state => state.tableForeignKeyReferences;
export const tables = createSelector(
	[card, databases],
    (card, databases) => {
    	const databaseId = card && card.dataset_query && card.dataset_query.database;
    	if (databaseId && databases && databases.length > 0) {
    		let db = _.findWhere(databases, { id: databaseId });
	        if (db && db.tables) {
	            return db.tables;
	        }
    	}
        
        return [];
    }
);

export const isObjectDetail = createSelector(
	[state => state.queryResult],
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
	            dataset_query.query.aggregation &&
	            dataset_query.query.aggregation.length > 0 &&
	            dataset_query.query.aggregation[0] === "rows" &&
	            data.rows &&
	            data.rows.length === 1) {

	        // we need to know the PK field of the table that was queried, so find that now
	        let pkField;
	        for (var i=0; i < data.cols.length; i++) {
	            let coldef = data.cols[i];
	            if (coldef.table_id === dataset_query.query.source_table &&
	                    coldef.special_type === "id") {
	                pkField = coldef.id;
	            }
	        }

	        // now check that we have a filter clause w/ '=' filter on PK column
	        if (pkField !== undefined) {
	            for (var j=0; j < dataset_query.query.filter.length; j++) {
	                let filter = dataset_query.query.filter[j];
	                if (Array.isArray(filter) &&
	                        filter.length === 3 &&
	                        filter[0] === "=" &&
	                        filter[1] === pkField &&
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
	[state => state.queryResult, isObjectDetail],
	(queryResult, isObjectDetail) => {
		// if we are display bare rows, filter out columns with visibility_type = details-only
        if (queryResult && queryResult.json_query && !isObjectDetail &&
        		Query.isStructured(queryResult.json_query) &&
                Query.isBareRowsAggregation(queryResult.json_query.query)) {
        	// TODO: mutability?
            queryResult.data = DataGrid.filterOnPreviewDisplay(queryResult.data);
        }

        return queryResult;
	}
);
