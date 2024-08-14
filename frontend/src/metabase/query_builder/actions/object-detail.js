import _ from "underscore";

import { createThunkAction } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { MetabaseApi } from "metabase/services";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

import {
  getCard,
  getFirstQueryResult,
  getPKColumnIndex,
  getCanZoomPreviousRow,
  getCanZoomNextRow,
  getNextRowPKValue,
  getPreviousRowPKValue,
  getTableForeignKeys,
} from "../selectors";

import { setCardAndRun } from "./core";
import { updateUrl } from "./navigation";

export const ZOOM_IN_ROW = "metabase/qb/ZOOM_IN_ROW";
export const zoomInRow =
  ({ objectId }) =>
  (dispatch, getState) => {
    dispatch({ type: ZOOM_IN_ROW, payload: { objectId } });

    // don't show object id in url if it is a row index
    const hasPK = getPKColumnIndex(getState()) !== -1;
    hasPK && dispatch(updateUrl(null, { objectId, replaceState: false }));
  };

export const RESET_ROW_ZOOM = "metabase/qb/RESET_ROW_ZOOM";
export const resetRowZoom = () => dispatch => {
  dispatch({ type: RESET_ROW_ZOOM });
  dispatch(updateUrl());
};

function filterByFk(query, field, objectId) {
  const stageIndex = -1;
  const column = Lib.fromLegacyColumn(query, stageIndex, field);
  const filterClause =
    typeof objectId === "number"
      ? Lib.numberFilterClause({
          operator: "=",
          column,
          values: [objectId],
        })
      : Lib.stringFilterClause({
          operator: "=",
          column,
          values: [objectId],
          options: {},
        });
  return Lib.filter(query, stageIndex, filterClause);
}

export const FOLLOW_FOREIGN_KEY = "metabase/qb/FOLLOW_FOREIGN_KEY";
export const followForeignKey = createThunkAction(
  FOLLOW_FOREIGN_KEY,
  ({ objectId, fk }) => {
    return async (dispatch, getState) => {
      const state = getState();

      const card = getCard(state);
      const queryResult = getFirstQueryResult(state);

      if (!queryResult || !fk) {
        return false;
      }

      const metadata = getMetadata(getState());
      const databaseId = new Question(card, metadata).databaseId();
      const tableId = fk.origin.table.id;
      const metadataProvider = Lib.metadataProvider(databaseId, metadata);
      const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
      const baseQuery = Lib.queryFromTableOrCardMetadata(
        metadataProvider,
        table,
      );
      const query = filterByFk(baseQuery, fk.origin, objectId);
      const finalCard = Question.create({ databaseId, metadata })
        .setQuery(query)
        .card();

      dispatch(resetRowZoom());
      dispatch(setCardAndRun(finalCard));
    };
  },
);

export const LOAD_OBJECT_DETAIL_FK_REFERENCES =
  "metabase/qb/LOAD_OBJECT_DETAIL_FK_REFERENCES";
export const loadObjectDetailFKReferences = createThunkAction(
  LOAD_OBJECT_DETAIL_FK_REFERENCES,
  ({ objectId }) => {
    return async (dispatch, getState) => {
      dispatch({ type: CLEAR_OBJECT_DETAIL_FK_REFERENCES });

      const state = getState();
      const tableForeignKeys = getTableForeignKeys(state);

      if (!Array.isArray(tableForeignKeys)) {
        return null;
      }

      const card = getCard(state);
      const queryResult = getFirstQueryResult(state);

      async function getFKCount(card, fk) {
        const metadata = getMetadata(getState());
        const databaseId = new Question(card, metadata).databaseId();
        const tableId = fk.origin.table_id;
        const metadataProvider = Lib.metadataProvider(databaseId, metadata);
        const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
        const baseQuery = Lib.queryFromTableOrCardMetadata(
          metadataProvider,
          table,
        );
        const aggregatedQuery = Lib.aggregateByCount(baseQuery, -1);
        const query = filterByFk(aggregatedQuery, fk.origin, objectId);
        const finalCard = Question.create({ databaseId, metadata })
          .setQuery(query)
          .datasetQuery();

        const info = { status: 0, value: null };

        try {
          const result = await MetabaseApi.dataset(finalCard);
          if (
            result &&
            result.status === "completed" &&
            result.data.rows.length > 0
          ) {
            info["value"] = result.data.rows[0][0];
          } else {
            info["value"] = "Unknown";
          }
        } finally {
          info["status"] = 1;
        }

        return info;
      }

      // TODO: there are possible cases where running a query would not require refreshing this data, but
      // skipping that for now because it's easier to just run this each time

      // run a query on FK origin table where FK origin field = objectDetailIdValue
      const fkReferences = {};
      for (let i = 0; i < tableForeignKeys.length; i++) {
        const fk = tableForeignKeys[i];
        const info = await getFKCount(card, fk);
        fkReferences[fk.origin.id] = info;
      }

      // It's possible that while we were running those queries, the object
      // detail id changed. If so, these fk reference are stale and we shouldn't
      // put them in state. The detail id is used in the query so we check that.
      const updatedQueryResult = getFirstQueryResult(getState());
      if (!_.isEqual(queryResult.json_query, updatedQueryResult.json_query)) {
        return null;
      }
      return fkReferences;
    };
  },
);

export const CLEAR_OBJECT_DETAIL_FK_REFERENCES =
  "metabase/qb/CLEAR_OBJECT_DETAIL_FK_REFERENCES";

export const viewNextObjectDetail = () => {
  return (dispatch, getState) => {
    if (getCanZoomNextRow(getState())) {
      const objectId = getNextRowPKValue(getState());
      dispatch(zoomInRow({ objectId }));
    }
  };
};

export const viewPreviousObjectDetail = () => {
  return (dispatch, getState) => {
    if (getCanZoomPreviousRow(getState())) {
      const objectId = getPreviousRowPKValue(getState());
      dispatch(zoomInRow({ objectId }));
    }
  };
};

export const closeObjectDetail = () => dispatch => dispatch(resetRowZoom());
