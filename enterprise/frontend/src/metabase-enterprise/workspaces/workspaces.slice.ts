import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import type { Workspace } from "metabase-enterprise/api";

export interface WorkspacesState {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
}

const initialState: WorkspacesState = {
  currentWorkspace: null,
  workspaces: [],
  isLoading: false,
  error: null,
};

const workspacesSlice = createSlice({
  name: "workspaces",
  initialState,
  reducers: {
    setCurrentWorkspace: (state, action: PayloadAction<Workspace | null>) => {
      state.currentWorkspace = action.payload;
    },
    setWorkspaces: (state, action: PayloadAction<Workspace[]>) => {
      state.workspaces = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    addWorkspace: (state, action: PayloadAction<Workspace>) => {
      state.workspaces.push(action.payload);
    },
    updateWorkspace: (state, action: PayloadAction<Workspace>) => {
      const index = state.workspaces.findIndex(
        (w) => w.id === action.payload.id,
      );
      if (index !== -1) {
        state.workspaces[index] = action.payload;
      }
      if (state.currentWorkspace?.id === action.payload.id) {
        state.currentWorkspace = action.payload;
      }
    },
    removeWorkspace: (state, action: PayloadAction<number>) => {
      state.workspaces = state.workspaces.filter(
        (w) => w.id !== action.payload,
      );
      if (state.currentWorkspace?.id === action.payload) {
        state.currentWorkspace = null;
      }
    },
    resetWorkspaces: () => {
      return initialState;
    },
  },
});

export const {
  setCurrentWorkspace,
  setWorkspaces,
  setLoading,
  setError,
  addWorkspace,
  updateWorkspace,
  removeWorkspace,
  resetWorkspaces,
} = workspacesSlice.actions;

export const workspacesReducer = workspacesSlice.reducer;