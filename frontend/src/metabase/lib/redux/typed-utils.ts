import { createAsyncThunk as createAsyncThunkOriginal } from "@reduxjs/toolkit";
import type { State, Dispatch } from "metabase-types/store";

export const createAsyncThunk = createAsyncThunkOriginal.withTypes<{
  state: State;
  dispatch: Dispatch;
}>();
