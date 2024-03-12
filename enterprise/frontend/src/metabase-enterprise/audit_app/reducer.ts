import { createReducer } from "@reduxjs/toolkit";

import { createAsyncThunk } from "metabase/lib/redux";
import { AuditApi } from "metabase-enterprise/services";

import { isAuditInfoComplete } from "./selectors";
import type { AuditInfoState } from "./types/state";

const LOAD_AUDIT_INFO = "metabase-enterprise/audit/FETCH_AUDIT_INFO";

export const loadInfo = createAsyncThunk(
  LOAD_AUDIT_INFO,
  async (_, { getState }) => {
    const state = getState() as AuditInfoState;
    const isComplete = isAuditInfoComplete(state);
    if (!isComplete) {
      const data = await AuditApi.getAuditInfo();
      return data;
    }
  },
);

const initialState = {
  isLoading: false,
  isComplete: false,
  data: undefined,
};

export const auditInfo = createReducer(initialState, builder => {
  builder.addCase(loadInfo.pending, state => {
    state.isLoading = true;
  });

  builder.addCase(loadInfo.fulfilled, (state, { payload }) => {
    state.isLoading = false;
    state.isComplete = true;
    state.data = payload || state.data;
  });
});
