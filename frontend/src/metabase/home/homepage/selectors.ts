import { createSelector } from "reselect";
import { Dashboard, Database } from "metabase-types/api";
import { State } from "metabase-types/store";
import { createCandidatesQuery } from "./utils/database-candidates";

export interface CandidatesProps {
  databases?: Database[];
  dashboards?: Dashboard[];
}

export const getCandidatesQuery = createSelector(
  (state: State, props: CandidatesProps) => props.databases,
  (state: State, props: CandidatesProps) => props.dashboards,
  (state: State) => getShowXrays(state),
  (state: State) => getEnableXrays(state),
  createCandidatesQuery,
);

export const getSettings = createSelector(
  (state: State) => state.settings,
  settings => settings.values,
);

export const getShowData = createSelector([getSettings], settings =>
  Boolean(settings["show-homepage-data"]),
);

export const getShowXrays = createSelector([getSettings], settings =>
  Boolean(settings["show-homepage-xrays"]),
);

export const getEnableXrays = createSelector([getSettings], settings =>
  Boolean(settings["enable-xrays"]),
);

export const getShowPinMessage = createSelector([getSettings], settings =>
  Boolean(settings["show-homepage-pin-message"]),
);

export const getShowSyncingModal = createSelector([getSettings], settings =>
  Boolean(settings["show-database-syncing-modal"]),
);
