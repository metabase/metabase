import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { State } from "metabase-types/store";

interface DatabaseState {
  dbInputValue: number | null;
  companyName: string;
}

const initialState: DatabaseState = {
  dbInputValue: null, // Default initial value for dbInputValue
  companyName: "",    // Default initial value for companyName
};

const databaseSlice = createSlice({
  name: "database",
  initialState,
  reducers: {
    setDBInputValue(state, action: PayloadAction<number>) {
      state.dbInputValue = action.payload;
    },
    setCompanyName(state, action: PayloadAction<string>) {
      state.companyName = action.payload;
    },
    clearDatabaseState(state) {
      state.dbInputValue = null;
      state.companyName = "";
    },
  },
});

// Export the actions to be used in components
export const { setDBInputValue, setCompanyName, clearDatabaseState } =
  databaseSlice.actions;

// Export the reducer to be included in the store
export const databaseReducer = databaseSlice.reducer;

// Selector to get the dbInputValue and companyName state
export const getDBInputValue = (state: State) => state.database.dbInputValue;
export const getCompanyName = (state: State) => state.database.companyName;
