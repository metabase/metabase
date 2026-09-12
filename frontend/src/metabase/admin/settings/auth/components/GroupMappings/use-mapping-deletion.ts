import { useState } from "react";
import { t } from "ttag";

import type {
  DeleteMappingModalValueType,
  GroupIds,
} from "metabase/admin/types";
import {
  useClearGroupMembershipMutation,
  useDeletePermissionsGroupMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";

import type { GroupMappingsState } from "./use-group-mappings";
import { type GroupLookup, withoutMapping } from "./utils";

type MappingCascade = {
  value: Exclude<DeleteMappingModalValueType, "nothing">;
  groupIds: GroupIds;
};

export type MappingDeletionState = {
  target: string | null;
  targetGroupIds: GroupIds;
  isDeleting: boolean;
  requestDelete: (name: string) => void;
  cancelDelete: () => void;
  confirmDelete: (
    value: DeleteMappingModalValueType,
    groupIds: GroupIds,
    name: string,
  ) => Promise<void>;
};

export function useMappingDeletion({
  groupMapping,
  groupLookup,
}: {
  groupMapping: GroupMappingsState;
  groupLookup: GroupLookup;
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
  const runCascade = async (cascade: MappingCascade | null) => {
    if (cascade == null) {
      return { failureCount: 0 };
    }
    // the group calls are independent, so they run at once
    const results = await Promise.allSettled(
      cascade.groupIds.map((groupId) =>
        cascade.value === "clear"
          ? clearGroupMembership(groupId).unwrap()
          : deletePermissionsGroup(groupId).unwrap(),
      ),
    );
    const failures = results.filter((result) => result.status === "rejected");
    failures.forEach((failure) => console.error(failure.reason));
    return { failureCount: failures.length };
  };

  const deleteMapping = async (
    name: string,
    cascade: MappingCascade | null,
  ) => {
    const nextMappings = withoutMapping(
      groupMapping.mappings,
      name,
      cascade?.value === "delete" ? cascade.groupIds : [],
    );
    const result = await groupMapping.saveMappings(nextMappings);
    if (!result.ok) {
      return;
    }
    const { failureCount } = await runCascade(cascade);
    if (failureCount > 0) {
      sendToast({
        message: t`Mapping deleted, but not all of its groups could be updated`,
        icon: "warning",
        toastColor: "feedback-negative",
      });
      return;
    }
    sendToast({ message: t`Mapping deleted`, icon: "check_filled" });
  };

  const confirmDelete = async (
    value: DeleteMappingModalValueType,
    groupIds: GroupIds,
    name: string,
  ) => {
    setTarget(null);
    const cascade =
      value === "nothing"
        ? null
        : { value, groupIds: groupLookup.actionableIds(groupIds) };
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
