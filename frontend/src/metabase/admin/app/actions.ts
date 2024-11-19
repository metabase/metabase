import { updateSetting } from "metabase/admin/settings/settings";
import { createAsyncThunk } from "metabase/lib/redux";

import { getCurrentVersion } from "../settings/selectors";

export const disableNotice = createAsyncThunk(
  "metabase/admin/app/DISABLE_NOTICE",
  async (_, { getState, dispatch }) => {
    const setting = {
      key: "deprecation-notice-version",
      value: getCurrentVersion(getState()),
    };
    await dispatch(updateSetting(setting));
  },
);
