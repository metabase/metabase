import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { State } from "metabase-types/store";

interface InitialSchemaState {
  schema: any[];
}

const initialState: InitialSchemaState = {
    schema: [], // Default initial schema
};

const initialSchemaSlice = createSlice({
  name: "initialSchema",
  initialState,
  reducers: {
    setInitialSchema(state, action: PayloadAction<any[]>) {
      state.schema = action.payload;
    },
    clearInitialSchema(state) {
      state.schema = [];
    },
  },
});

// Export the actions to be used in components
export const { setInitialSchema, clearInitialSchema } =
  initialSchemaSlice.actions;

// Export the reducer to be included in the store
export const initialSchemaReducer = initialSchemaSlice.reducer;

// Selector to get the initialSchema state
export const getInitialSchema = (state: State) => state.initialSchema;
