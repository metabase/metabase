import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

export interface MetabotState {
  userMessages: string[];
  visible: boolean;
}

const initialState: MetabotState = {
  userMessages: [],
  visible: false,
};

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState,
  reducers: {
    setVisible: (state, action: PayloadAction<boolean>) => {
      state.visible = action.payload;
    },
    addUserMessage: (state, action: PayloadAction<string>) => {
      state.userMessages.push(action.payload);
    },
    removeUserMessage: (state, action: PayloadAction<number>) => {
      state.userMessages.splice(action.payload, 1);
    },
    clearUserMessages: state => {
      state.userMessages = [];
    },
  },
});

export const metabotReducer = metabot.reducer;
