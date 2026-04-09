import { createAsyncThunk } from "metabase/lib/redux";
import { updateSetting } from "metabase/redux/settings";

import { getCurrentVersion } from "./selectors";

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
