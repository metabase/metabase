import { createAsyncThunk } from "@reduxjs/toolkit";

import { updateSetting } from "metabase/admin/settings/settings";
import Settings from "metabase/lib/settings";

export const disableNotice = createAsyncThunk(
  "metabase/admin/app/DISABLE_NOTICE",
  async (_, { dispatch }) => {
    const setting = {
      key: "deprecation-notice-version",
      value: Settings.currentVersion(),
    };
    await dispatch(updateSetting(setting));
  },
);
