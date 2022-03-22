import Settings from "metabase/lib/settings";
import { createThunkAction } from "metabase/lib/redux";
import { updateSetting } from "metabase/admin/settings/settings";

export const DISABLE_NOTICE = "metabase/admin/app/DISABLE_NOTICE";
export const disableNotice = createThunkAction(
  DISABLE_NOTICE,
  () => async (dispatch: any) => {
    const setting = {
      key: "deprecation-notice-version",
      value: Settings.currentVersion(),
    };
    await dispatch(updateSetting(setting));
  },
);
