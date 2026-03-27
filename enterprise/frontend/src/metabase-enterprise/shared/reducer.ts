import { createSlice } from "@reduxjs/toolkit";

import { GTAPApi } from "metabase/services";
import { createAsyncThunk } from "metabase/utils/redux";
import type { UserAttributeKey } from "metabase-types/api";

export const fetchUserAttributes = createAsyncThunk(
  "metabase-enterprise/shared/FETCH_USER_ATTRIBUTES",
  async () => GTAPApi.attributes(),
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
