import { createSlice } from "@reduxjs/toolkit";

import { userApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { createAsyncThunk } from "metabase/redux/utils";
import type { UserAttributeKey } from "metabase-types/api";

export const fetchUserAttributes = createAsyncThunk(
  "metabase-enterprise/shared/FETCH_USER_ATTRIBUTES",
  async (_, { dispatch }) =>
    runRtkEndpoint(undefined, dispatch, userApi.endpoints.listUserAttributes),
);

export interface EnterpriseSharedState {
  attributes: UserAttributeKey[] | null;
}

const initialState: EnterpriseSharedState = {
  attributes: null,
};

export const shared = createSlice({
  initialState,
  name: "metabase-enterprise/shared",
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchUserAttributes.fulfilled, (state, action) => {
      state.attributes = action.payload;
    });
  },
});
