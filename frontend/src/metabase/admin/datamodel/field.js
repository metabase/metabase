import { createThunkAction } from "metabase/lib/redux";

import { MetabaseApi } from "metabase/services";

export const RESCAN_FIELD_VALUES = "metabase/admin/fields/RESCAN_FIELD_VALUES";
export const DISCARD_FIELD_VALUES =
  "metabase/admin/fields/DISCARD_FIELD_VALUES";

export const rescanFieldValues = createThunkAction(
  RESCAN_FIELD_VALUES,
  function (fieldId) {
    return async function () {
      try {
        const call = await MetabaseApi.field_rescan_values({ fieldId });
        return call;
      } catch (error) {
        console.error("error manually re-scanning field values", error);
      }
    };
  },
);

export const discardFieldValues = createThunkAction(
  DISCARD_FIELD_VALUES,
  function (fieldId) {
    return async function () {
      try {
        const call = await MetabaseApi.field_discard_values({ fieldId });
        return call;
      } catch (error) {
        console.error("error discarding field values", error);
      }
    };
  },
);
