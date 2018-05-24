import { createThunkAction } from "metabase/lib/redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { MetabaseApi } from "metabase/services";

export const RESCAN_TABLE_VALUES = "metabase/admin/tables/RESCAN_TABLE_VALUES";
export const DISCARD_TABLE_VALUES =
  "metabase/admin/tables/DISCARD_TABLE_VALUES";

export const rescanTableFieldValues = createThunkAction(
  RESCAN_TABLE_VALUES,
  function(tableId) {
    return async function(dispatch, getState) {
      try {
        let call = await MetabaseApi.table_rescan_values({ tableId });
        MetabaseAnalytics.trackEvent(
          "Data Model",
          "Manual Re-scan Field Values for Table",
        );
        return call;
      } catch (error) {
        console.log("error manually re-scanning field values", error);
      }
    };
  },
);

export const discardTableFieldValues = createThunkAction(
  DISCARD_TABLE_VALUES,
  function(tableId) {
    return async function(dispatch, getState) {
      try {
        let call = await MetabaseApi.table_discard_values({ tableId });
        MetabaseAnalytics.trackEvent(
          "Data Model",
          "Manual Discard Field Values for Table",
        );
        return call;
      } catch (error) {
        console.log("error discarding field values", error);
      }
    };
  },
);
