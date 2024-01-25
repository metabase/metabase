import { MetabaseApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";
import type { FieldId, TableId } from "metabase-types/api";

export const RESCAN_FIELD_VALUES = "metabase/admin/fields/RESCAN_FIELD_VALUES";
export const rescanFieldValues = createThunkAction(
  RESCAN_FIELD_VALUES,
  (fieldId: FieldId) => async () => {
    try {
      await MetabaseApi.field_rescan_values({ fieldId });
    } catch (error) {
      console.error("error manually re-scanning field values", error);
    }
  },
);

export const DISCARD_FIELD_VALUES =
  "metabase/admin/fields/DISCARD_FIELD_VALUES";
export const discardFieldValues = createThunkAction(
  DISCARD_FIELD_VALUES,
  (fieldId: FieldId) => async () => {
    try {
      await MetabaseApi.field_discard_values({ fieldId });
    } catch (error) {
      console.error("error discarding field values", error);
    }
  },
);

export const RESCAN_TABLE_VALUES = "metabase/admin/tables/RESCAN_TABLE_VALUES";
export const rescanTableFieldValues = createThunkAction(
  RESCAN_TABLE_VALUES,
  (tableId: TableId) => async () => {
    try {
      await MetabaseApi.table_rescan_values({ tableId });
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
    } catch (error) {
      console.error("error discarding field values", error);
    }
  },
);
