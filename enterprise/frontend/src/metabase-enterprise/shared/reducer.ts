import { createSlice } from "@reduxjs/toolkit";
import { UserAttribute } from "metabase-types/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { GTAPApi } from "metabase/services";

export const fetchUserAttributes = createAsyncThunk(
  "metabase-enterprise/shared/FETCH_USER_ATTRIBUTES",
  async () => GTAPApi.attributes(),
);

export interface EnterpriseSharedState {
  attributes: UserAttribute[] | null;
}

const initialState: EnterpriseSharedState = {
  attributes: null,
};

export const shared = createSlice({
  initialState,
  name: "metabase-enterprise/shared",
  reducers: {},
  extraReducers: builder => {
    builder.addCase(fetchUserAttributes.fulfilled, (state, action) => {
      state.attributes = action.payload;
    });
  },
});
