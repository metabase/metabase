import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";

import type { GroupTableAccessPolicyParams, SandboxesState } from "./types";
import { getPolicyKeyFromParams } from "./utils";

const getPluginState = (state: State) =>
  // the plugin slice is registered by initializePlugin, so it is present
  // whenever these selectors run
  (state as SandboxesState).plugins.sandboxingPlugin;

export const getGroupTableAccessPolicy = (
  state: State,
  { params }: { params: GroupTableAccessPolicyParams },
) => {
  const key = getPolicyKeyFromParams(params);

  return getPluginState(state).groupTableAccessPolicies[key];
};

export const getDraftPolicies = (state: State) => {
  return Object.values(getPluginState(state).groupTableAccessPolicies);
};

export const hasPolicyChanges = createSelector(
  getDraftPolicies,
  (policies) => policies != null && policies.length > 0,
);
