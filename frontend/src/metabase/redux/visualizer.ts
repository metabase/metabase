import { createAction, createReducer } from "@reduxjs/toolkit";

const initialState = {
  ui: {
    vizSettings: false,
    data: true,
  },
};

export const visualizer = createReducer(initialState, builder => {});
