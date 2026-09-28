import { useState } from "react";
import { t } from "ttag";

import {
  useClearGroupMembershipMutation,
  useDeletePermissionsGroupMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import type { GroupId } from "metabase-types/api";

import type { CascadeValue, DeleteMappingModalValueType } from "./types";
import type { GroupMappingsState } from "./use-group-mappings";
import { type GroupLookup, withoutGroups, withoutMapping } from "./utils";

type MappingCascade = {
  value: CascadeValue;
  groupIds: GroupId[];
};

type CascadeOutcome = {
  deletedIds: GroupId[];
  failureCount: number;
};

export type MappingDeletionState = {
  target: string | null;
  targetGroupIds: GroupId[];
  isDeleting: boolean;
  requestDelete: (name: string) => void;
  cancelDelete: () => void;
  confirmDelete: (value: DeleteMappingModalValueType) => Promise<void>;
};

export function useMappingDeletion({
  groupMapping,
  groupLookup,
  lastMappingDeletedMessage,
}: {
  groupMapping: GroupMappingsState;
  groupLookup: GroupLookup;
  // replaces the success toast when the deletion empties the mappings, for providers that stop syncing then
  lastMappingDeletedMessage?: string;
}): MappingDeletionState {
  const [sendToast] = useToast();
  const [clearGroupMembership] = useClearGroupMembershipMutation();
  const [deletePermissionsGroup] = useDeletePermissionsGroupMutation();
  const [target, setTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const targetGroupIds =
    target == null
      ? []
      : groupLookup.existingIds(groupMapping.mappings[target] ?? []);

  // "nothing, just remove the mapping" arrives as null and touches no group
  const runCascade = async (
    cascade: MappingCascade | null,
  ): Promise<CascadeOutcome> => {
    if (cascade == null) {
      return { deletedIds: [], failureCount: 0 };
    }
    const results = await Promise.allSettled(
      cascade.groupIds.map((groupId) =>
        cascade.value === "clear"
          ? clearGroupMembership(groupId).unwrap()
          : deletePermissionsGroup(groupId).unwrap(),
      ),
    );
    const failures = results.filter((result) => result.status === "rejected");
    failures.forEach((failure) => console.error(failure.reason));
    let deletedIds: GroupId[] = [];
    if (cascade.value === "delete") {
      deletedIds = cascade.groupIds.filter(
        (_groupId, index) => results[index].status === "fulfilled",
      );
    }
    return { deletedIds, failureCount: failures.length };
  };

  const deleteMapping = async (
    name: string,
    cascade: MappingCascade | null,
  ) => {
    // the mapping goes first, so a failed write never leaves deleted groups behind
    const nextMappings = withoutMapping(groupMapping.mappings, name);
    const result = await groupMapping.saveMappings(nextMappings);
    if (!result.ok) {
      return;
    }
    const { deletedIds, failureCount } = await runCascade(cascade);
    // the other mappings lose a group only once the backend has deleted it
    const deleted = new Set(deletedIds);
    const hasDeletedGroups = Object.values(nextMappings).some((ids) =>
      ids.some((groupId) => deleted.has(groupId)),
    );
    if (hasDeletedGroups) {
      const scrubResult = await groupMapping.saveMappings(
        withoutGroups(nextMappings, deletedIds),
      );
      if (!scrubResult.ok) {
        return;
      }
    }
    if (failureCount > 0) {
      sendToast({
        message: t`Mapping deleted, but not all of its groups could be updated`,
        icon: "warning",
        toastColor: "feedback-negative",
      });
      return;
    }
    const isLastMapping = Object.keys(nextMappings).length === 0;
    sendToast({
      message:
        isLastMapping && lastMappingDeletedMessage != null
          ? lastMappingDeletedMessage
          : t`Mapping deleted`,
      icon: "check_filled",
    });
  };

  const confirmDelete = async (value: DeleteMappingModalValueType) => {
    if (target == null) {
      return;
    }
    const name = target;
    const groupIds = targetGroupIds;
    setTarget(null);
    const cascade =
      value === "nothing"
        ? null
        : { value, groupIds: groupLookup.actionableIds(groupIds, value) };
    // the write releases its own busy flag before the cascade, so this one covers the whole operation
    setIsDeleting(true);
    try {
      await deleteMapping(name, cascade);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    target,
    targetGroupIds,
    isDeleting,
    requestDelete: setTarget,
    cancelDelete: () => setTarget(null),
    confirmDelete,
  };
}
