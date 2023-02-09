import { createSelector } from "reselect";
import { GroupTableAccessPolicyParams, SandboxesState } from "./types";
import { getPolicyKeyFromParams } from "./utils";

export const getPolicyRequestState = (
  state: SandboxesState,
  { params }: { params: GroupTableAccessPolicyParams },
) => {
  const { groupId, tableId } = params;
  const key = getPolicyKeyFromParams({ groupId, tableId });
  return state.requests?.plugins?.sandboxesPlugin?.policies?.[key];
};

export const getGroupTableAccessPolicy = (
  state: SandboxesState,
  { params }: { params: GroupTableAccessPolicyParams },
) => {
  const key = getPolicyKeyFromParams(params);

  return (
    state.plugins.sandboxingPlugin.groupTableAccessPolicies[key] ??
    state.plugins.sandboxingPlugin.originalGroupTableAccessPolicies[key]
  );
};

export const getAttributes = (state: SandboxesState) => {
  return state.plugins.sandboxingPlugin.attributes;
};

export const getDraftPolicies = (state: SandboxesState) => {
  return Object.values(state.plugins.sandboxingPlugin.groupTableAccessPolicies);
};

export const hasPolicyChanges = createSelector(
  getDraftPolicies,
  policies => policies != null && Object.values(policies).length > 0,
);
