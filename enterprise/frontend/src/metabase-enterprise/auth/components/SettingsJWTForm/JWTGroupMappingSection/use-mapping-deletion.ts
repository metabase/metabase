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

import type {
  GroupMappingSettings,
  GroupMappingSettingsState,
} from "./use-group-mapping-settings";
import { type GroupLookup, withoutMapping } from "./utils";

type MappingCascade = {
  value: Exclude<DeleteMappingModalValueType, "nothing">;
  groupIds: GroupIds;
};

export function useMappingDeletion({
  groupMapping,
  groupLookup,
}: {
  groupMapping: GroupMappingSettingsState;
  groupLookup: GroupLookup;
}) {
  const [sendToast] = useToast();
  const [clearGroupMembership] = useClearGroupMembershipMutation();
  const [deletePermissionsGroup] = useDeletePermissionsGroupMutation();
  const [target, setTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const targetGroupIds =
    target == null
      ? []
      : groupLookup.existingIds(groupMapping.mappings[target] ?? []);
  const isDeletingLastMapping =
    target != null && Object.keys(groupMapping.mappings).length === 1;

  /** "nothing, just remove the mapping" arrives as null and touches no group */
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
    const isLastMapping = Object.keys(nextMappings).length === 0;
    // sync can't stay on without mappings, or the backend would silently fall back to name matching
    const settings: GroupMappingSettings = isLastMapping
      ? { "jwt-group-mappings": nextMappings, "jwt-group-sync": false }
      : { "jwt-group-mappings": nextMappings };
    const saved = await groupMapping.saveSettings(settings);
    if (!saved) {
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
    sendToast({
      message: isLastMapping
        ? t`Mapping deleted and group mapping turned off`
        : t`Mapping deleted`,
      icon: "check_filled",
    });
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
    isDeletingLastMapping,
    isDeleting,
    requestDelete: setTarget,
    cancelDelete: () => setTarget(null),
    confirmDelete,
  };
}
