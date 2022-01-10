import { createThunkAction } from "metabase/lib/redux";
import { updateSetting } from "metabase/admin/settings/settings";

export const DISABLE_NOTICE = "metabase/admin/app/DISABLE_NOTICE";
export const disableNotice = createThunkAction(DISABLE_NOTICE, function() {
  return async function(dispatch: any) {
    const setting = { key: "deprecation-notice-enabled", value: false };
    await dispatch(updateSetting(setting));
  };
});
