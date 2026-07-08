import { createSelector } from "@reduxjs/toolkit";

import type { GroupTableAccessPolicyParams, SandboxesState } from "./types";
import { getPolicyKeyFromParams } from "./utils";

export const getGroupTableAccessPolicy = (
  state: SandboxesState,
  { params }: { params: GroupTableAccessPolicyParams },
) => {
  const key = getPolicyKeyFromParams(params);

  return state.plugins.sandboxingPlugin.groupTableAccessPolicies[key];
};

export const getDraftPolicies = (state: SandboxesState) => {
  return Object.values(state.plugins.sandboxingPlugin.groupTableAccessPolicies);
};

export const hasPolicyChanges = createSelector(
  getDraftPolicies,
  (policies) => policies != null && policies.length > 0,
);
