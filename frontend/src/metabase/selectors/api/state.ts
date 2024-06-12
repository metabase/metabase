import { createSelector } from "@reduxjs/toolkit";

import { Api } from "metabase/api";

export const getApiState = createSelector(
  (state: any) => state[Api.reducerPath],
  state => ({ [Api.reducerPath]: state }),
);

export type ApiState = ReturnType<typeof getApiState>;
