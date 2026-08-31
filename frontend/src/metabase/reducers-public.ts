// Reducers needed for public questions and dashboards

import type { StateFromReducersMapObject } from "@reduxjs/toolkit";

import { commonReducers } from "./reducers-common";

export const publicReducers = {
  ...commonReducers,
};

/**
 * The public app's state, derived from the slices this root composes.
 */
export type PublicState = StateFromReducersMapObject<typeof publicReducers>;
