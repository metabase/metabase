import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { setIn } from "formik";
import type { State } from "metabase-types/store";

interface DatabaseState {
  insightdbInputValue: number | null;
  dbInputValue: number | null;
  companyName: string;
}

const initialState: DatabaseState = {
  insightdbInputValue: null, // Default initial value for insightdbInputValue
  dbInputValue: null, // Default initial value for dbInputValue
  companyName: "",    // Default initial value for companyName
};

const databaseSlice = createSlice({
  name: "database",
  initialState,
  reducers: {
    setInsightDBInputValue(state, action: PayloadAction<number>) {
      state.insightdbInputValue = action.payload;
    },
    setDBInputValue(state, action: PayloadAction<number>) {
      state.dbInputValue = action.payload;
    },
    setCompanyName(state, action: PayloadAction<string>) {
      state.companyName = action.payload;
    },
    clearDatabaseState(state) {
      state.insightdbInputValue = null;
      state.dbInputValue = null;
      state.companyName = "";
    },
  },
});

// Export the actions to be used in components
export const { setInsightDBInputValue, setDBInputValue, setCompanyName, clearDatabaseState } =
  databaseSlice.actions;

// Export the reducer to be included in the store
export const databaseReducer = databaseSlice.reducer;

// Selector to get the dbInputValue and companyName state
export const getDBInputValue = (state: State) => state.database.dbInputValue;
export const getCompanyName = (state: State) => state.database.companyName;
export const getInsightDBInputValue = (state: State) => state.database.insightdbInputValue;
