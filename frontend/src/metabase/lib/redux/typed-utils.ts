import { createAsyncThunk as createAsyncThunkOriginal } from "@reduxjs/toolkit";
import type { State } from "metabase-types/store";

interface ThunkConfig {
  state: State;
}

export const createAsyncThunk =
  createAsyncThunkOriginal.withTypes<ThunkConfig>();
