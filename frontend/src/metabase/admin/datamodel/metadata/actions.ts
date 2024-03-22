import { trackStructEvent } from "metabase/lib/analytics";
import { createThunkAction } from "metabase/lib/redux";
import { MetabaseApi } from "metabase/services";
import type { TableId } from "metabase-types/api";

export const RESCAN_TABLE_VALUES = "metabase/admin/tables/RESCAN_TABLE_VALUES";
export const rescanTableFieldValues = createThunkAction(
  RESCAN_TABLE_VALUES,
  (tableId: TableId) => async () => {
    try {
      await MetabaseApi.table_rescan_values({ tableId });
      trackStructEvent("Data Model", "Manual Re-scan Field Values for Table");
    } catch (error) {
      console.error("error manually re-scanning field values", error);
    }
  },
);

export const DISCARD_TABLE_VALUES =
  "metabase/admin/tables/DISCARD_TABLE_VALUES";
export const discardTableFieldValues = createThunkAction(
  DISCARD_TABLE_VALUES,
  (tableId: TableId) => async () => {
    try {
      await MetabaseApi.table_discard_values({ tableId });
      trackStructEvent("Data Model", "Manual Discard Field Values for Table");
    } catch (error) {
      console.error("error discarding field values", error);
    }
  },
);
