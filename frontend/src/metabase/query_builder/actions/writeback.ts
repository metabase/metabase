import {
  createRow,
  updateRow,
  deleteRow,
  InsertRowPayload,
  UpdateRowPayload,
  DeleteRowPayload,
} from "metabase/writeback/actions";

import { closeObjectDetail } from "./object-detail";
import { runQuestionQuery } from "./querying";
import { setUIControls } from "./ui";

export const INSERT_ROW_FROM_TABLE_VIEW =
  "metabase/qb/INSERT_ROW_FROM_TABLE_VIEW";
export const createRowFromTableView = (payload: InsertRowPayload) => {
  return async (dispatch: any) => {
    const result = await createRow(payload);
    dispatch.action(INSERT_ROW_FROM_TABLE_VIEW, payload);
    if (result?.["created-row"]?.id) {
      dispatch(setUIControls({ modal: null, modalContext: null }));
      dispatch(runQuestionQuery());
    }
  };
};

export const UPDATE_ROW_FROM_OBJECT_DETAIL =
  "metabase/qb/UPDATE_ROW_FROM_OBJECT_DETAIL";
export const updateRowFromObjectDetail = (payload: UpdateRowPayload) => {
  return async (dispatch: any) => {
    const result = await updateRow(payload);
    dispatch.action(UPDATE_ROW_FROM_OBJECT_DETAIL, payload);
    if (result?.["rows-updated"]?.length > 0) {
      dispatch(closeObjectDetail());
      dispatch(runQuestionQuery());
    }
  };
};

export const DELETE_ROW_FROM_OBJECT_DETAIL =
  "metabase/qb/DELETE_ROW_FROM_OBJECT_DETAIL";
export const deleteRowFromObjectDetail = (payload: DeleteRowPayload) => {
  return async (dispatch: any) => {
    const result = await deleteRow(payload);

    dispatch.action(DELETE_ROW_FROM_OBJECT_DETAIL, payload);
    if (result?.["rows-deleted"]?.length > 0) {
      dispatch(closeObjectDetail());
      dispatch(runQuestionQuery());
    }
  };
};
