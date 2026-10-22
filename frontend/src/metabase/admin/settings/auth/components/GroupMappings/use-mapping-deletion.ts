import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  useClearGroupMembershipMutation,
  useDeletePermissionsGroupMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import type { GroupId, GroupMappings } from "metabase-types/api";

import type { CascadeValue, DeleteMappingModalValueType } from "./types";
import type { SaveMappings } from "./use-group-mappings";
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
  mappings,
  saveMappings,
  onDeletingChange,
  groupLookup,
}: {
  mappings: GroupMappings;
  saveMappings: SaveMappings;
  onDeletingChange?: (isDeleting: boolean) => void;
  groupLookup: GroupLookup;
}): MappingDeletionState {
  const [sendToast] = useToast();
  const [clearGroupMembership] = useClearGroupMembershipMutation();
  const [deletePermissionsGroup] = useDeletePermissionsGroupMutation();
  const [target, setTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const targetGroupIds =
    target == null ? [] : groupLookup.existingIds(mappings[target] ?? []);

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
    const nextMappings = withoutMapping(mappings, name);
    const result = await saveMappings(nextMappings);
    if (!result.ok) {
      return;
    }
    const { deletedIds, failureCount } = await runCascade(cascade);
    const deleted = new Set(deletedIds);
    const hasDeletedGroups = Object.values(nextMappings).some((ids) =>
      ids.some((groupId) => deleted.has(groupId)),
    );
    const scrubResult = hasDeletedGroups
      ? await saveMappings(withoutGroups(nextMappings, deletedIds), {
          showErrorToast: false,
        })
      : null;
    if (failureCount > 0) {
      sendToast({
        message: t`Mapping deleted, but not all of its groups could be updated`,
        variant: "warning",
      });
      return;
    }
    if (scrubResult?.ok === false) {
      sendToast({
        message: ngettext(
          msgid`Mapping deleted, but its deleted group could not be removed from the other mappings`,
          `Mapping deleted, but its deleted groups could not be removed from the other mappings`,
          deletedIds.length,
        ),
        variant: "warning",
      });
      return;
    }
    sendToast({ message: t`Mapping deleted`, icon: "check_filled" });
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
    onDeletingChange?.(true);
    try {
      await deleteMapping(name, cascade);
    } finally {
      setIsDeleting(false);
      onDeletingChange?.(false);
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
