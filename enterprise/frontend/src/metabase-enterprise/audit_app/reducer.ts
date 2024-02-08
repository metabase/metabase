import {  createReducer, createSelector } from "@reduxjs/toolkit";
import { createAsyncThunk } from "metabase/lib/redux";

import { GET } from "metabase/lib/api";
import type { AuditInfoState } from "./types/state";

const getAuditInfo = GET("/api/ee/audit-app/user/audit-info");

const LOAD_AUDIT_INFO =
  "metabase-enterprise/audit/FETCH_AUDIT_INFO";

const isAuditInfoLoading = (state:AuditInfoState) => {
  const {plugins: {auditInfo}} = state;
  return auditInfo.isLoading;
}

const isAuditInfoComplete = (state:AuditInfoState) => {
  const {plugins: {auditInfo}} = state;
  return auditInfo.isComplete;
}

export const dashboardOverviewId = (state:AuditInfoState) => state.plugins.auditInfo.data?.dashboardOverview ?? undefined;

export const loadInfo = createAsyncThunk(
  LOAD_AUDIT_INFO,
  async ({}, {getState}) => {
    console.log("we're here")
    const state = getState() as AuditInfoState;
    const isLoading = isAuditInfoLoading(state);
    const isComplete = isAuditInfoComplete(state);

    if(!isLoading && !isComplete){
      const data = await getAuditInfo(); 
      return data;
    }    
  }
)

const initialState = {
  isLoading: false,
  isComplete: false,
  data: undefined
}

export const auditInfo = createReducer(initialState, builder => {
  builder.addCase(loadInfo.pending, state => {
    state.isLoading = true
  });

  builder.addCase(loadInfo.fulfilled, (state, {payload}) => {
    state.isLoading = false;
    state.isComplete = true;
    state.data = payload || state.data;
  })
})