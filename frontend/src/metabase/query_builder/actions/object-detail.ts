import _ from "underscore";

import { createThunkAction } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { MetabaseApi } from "metabase/services";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Field from "metabase-lib/v1/metadata/Field";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import type { Card, DatasetColumn, FieldId } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import {
  getCanZoomNextRow,
  getCanZoomPreviousRow,
  getCard,
  getFirstQueryResult,
  getNextRowPKValue,
  getPreviousRowPKValue,
  getTableForeignKeys,
} from "../selectors";

import { setCardAndRun } from "./core/core";
import { updateUrl } from "./url";
import { zoomInRow } from "./zoom";

export const RESET_ROW_ZOOM = "metabase/qb/RESET_ROW_ZOOM";
export const resetRowZoom = () => (dispatch: Dispatch) => {
  dispatch({ type: RESET_ROW_ZOOM });

  dispatch(updateUrl(null, { preserveParameters: false }));
};

function filterByFk(
  query: Lib.Query,
  field: DatasetColumn | Field,
  objectId: ObjectId,
) {
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
      if (!databaseId) {
        return;
      }

      const tableId = fk.origin.table.id;
      const metadataProvider = Lib.metadataProvider(databaseId, metadata);
      const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
      if (table == null) {
        return;
      }
      const baseQuery = Lib.queryFromTableOrCardMetadata(
        metadataProvider,
        table,
      );
      const query = filterByFk(baseQuery, fk.origin, objectId);
      const finalCard = Question.create({
        dataset_query: Lib.toJsQuery(query),
        metadata,
      }).card();

      dispatch(resetRowZoom());
      dispatch(setCardAndRun(finalCard));
    };
  },
);

interface FKInfo {
  status: number;
  value: string | number | null;
}

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

      const card: Card = getCard(state);
      const queryResult = getFirstQueryResult(state);

      async function getFKCount(
        card: Card,
        fk: ForeignKey,
      ): Promise<FKInfo | undefined> {
        const metadata = getMetadata(getState());
        const databaseId = new Question(card, metadata).databaseId();
        const tableId = fk.origin?.table_id;
        if (!tableId || !databaseId || !fk.origin) {
          return;
        }
        const metadataProvider = Lib.metadataProvider(databaseId, metadata);
        const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
        if (table == null) {
          return;
        }
        const baseQuery = Lib.queryFromTableOrCardMetadata(
          metadataProvider,
          table,
        );
        const aggregatedQuery = Lib.aggregateByCount(baseQuery, -1);
        const query = filterByFk(aggregatedQuery, fk.origin, objectId);
        const finalCard = Question.create({
          dataset_query: Lib.toJsQuery(query),
          metadata,
        }).datasetQuery();

        const info: FKInfo = {
          status: 0,
          value: null,
        };

        try {
          const result = (await MetabaseApi.dataset(finalCard)) as {
            status?: string;
            data?: { rows: unknown[][] };
          } | null;
          if (
            result &&
            result.status === "completed" &&
            result.data &&
            result.data.rows.length > 0
          ) {
            info["value"] = result.data.rows[0][0] as string | number | null;
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
      const fkReferences: Record<FieldId, FKInfo | undefined> = {};
      for (let i = 0; i < tableForeignKeys.length; i++) {
        const fk = tableForeignKeys[i];
        const info = await getFKCount(card, fk);

        fkReferences[fk.origin_id] = info;
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
  return (dispatch: Dispatch, getState: GetState) => {
    if (getCanZoomNextRow(getState())) {
      const objectId = getNextRowPKValue(getState());
      dispatch(zoomInRow({ objectId }));
    }
  };
};

export const viewPreviousObjectDetail = () => {
  return (dispatch: Dispatch, getState: GetState) => {
    if (getCanZoomPreviousRow(getState())) {
      const objectId = getPreviousRowPKValue(getState());
      dispatch(zoomInRow({ objectId }));
    }
  };
};

export const closeObjectDetail = () => (dispatch: Dispatch) =>
  dispatch(resetRowZoom());
