import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

export interface MetabotState {
  visible: boolean;
}

const initialState: MetabotState = {
  visible: false,
};

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState,
  reducers: {
    setVisible: (state, action: PayloadAction<boolean>) => {
      state.visible = action.payload;
    },
  },
});

export const metabotReducer = metabot.reducer;
