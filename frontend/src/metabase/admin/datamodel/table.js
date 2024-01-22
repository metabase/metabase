import { createThunkAction } from "metabase/lib/redux";

import { MetabaseApi } from "metabase/services";

export const RESCAN_TABLE_VALUES = "metabase/admin/tables/RESCAN_TABLE_VALUES";
export const DISCARD_TABLE_VALUES =
  "metabase/admin/tables/DISCARD_TABLE_VALUES";

export const rescanTableFieldValues = createThunkAction(
  RESCAN_TABLE_VALUES,
  function (tableId) {
    return async function (dispatch, getState) {
      try {
        const call = await MetabaseApi.table_rescan_values({ tableId });
        return call;
      } catch (error) {
        console.error("error manually re-scanning field values", error);
      }
    };
  },
);

export const discardTableFieldValues = createThunkAction(
  DISCARD_TABLE_VALUES,
  function (tableId) {
    return async function (dispatch, getState) {
      try {
        const call = await MetabaseApi.table_discard_values({ tableId });
        return call;
      } catch (error) {
        console.error("error discarding field values", error);
      }
    };
  },
);
