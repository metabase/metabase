import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase-types/store";

export const getEntities = (state: State) => state.entities;

export const getCollectionsById = createSelector(
  [getEntities],
  entities => entities.collections,
);
