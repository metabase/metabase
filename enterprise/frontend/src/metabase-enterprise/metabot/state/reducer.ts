import { createSlice } from "@reduxjs/toolkit";

export interface MetabotState {}

const initialState: MetabotState = {};

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState,
  reducers: {},
});

export const metabotReducer = metabot.reducer;
