import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import type { GroupTableAccessPolicyParams, SandboxesState } from "./types";
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

// return new and altered policies
export const getGroupIdsOfModifiedPolices = (state: SandboxesState) => {
  const originalPolicies =
    state.plugins.sandboxingPlugin.originalGroupTableAccessPolicies;
  const policies = state.plugins.sandboxingPlugin.groupTableAccessPolicies;

  const allPolicyKeys = _.uniq(
    Object.keys(originalPolicies).concat(Object.keys(policies)),
  );

  const modifiedGroupIds = allPolicyKeys
    .map(key => {
      const before = originalPolicies[key];
      const after = policies[key];
      const groupId = before?.group_id ?? after?.group_id;

      // empty key can be present in original, so we may have an empty group id
      if (!groupId || _.isEqual(before, after)) {
        return null;
      }
      return `${groupId}`;
    })
    .filter(x => x !== null);

  return modifiedGroupIds;
};

export const getDraftPolicies = (state: SandboxesState) => {
  return Object.values(state.plugins.sandboxingPlugin.groupTableAccessPolicies);
};

export const hasPolicyChanges = createSelector(
  getDraftPolicies,
  policies => policies != null && policies.length > 0,
);
