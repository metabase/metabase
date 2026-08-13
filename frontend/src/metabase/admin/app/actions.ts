import { createAsyncThunk } from "metabase/redux/utils";
import { settingsApi } from "metabase/settings";

import { getCurrentVersion } from "./selectors";

export const disableNotice = createAsyncThunk(
  "metabase/admin/app/DISABLE_NOTICE",
  async (_, { getState, dispatch }) => {
    await dispatch(
      settingsApi.endpoints.updateSetting.initiate({
        key: "deprecation-notice-version",
        value: getCurrentVersion(getState()),
      }),
    ).unwrap();
  },
);
