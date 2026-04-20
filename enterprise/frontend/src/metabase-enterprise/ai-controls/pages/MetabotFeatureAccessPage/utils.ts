import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useGetAIControlsGroupPermissionsQuery,
  useUpdateAIControlsGroupPermissionsMutation,
} from "metabase-enterprise/api";
import { AIToolKey, type MetabotGroupPermission } from "metabase-types/api";

export type GroupTab = "user-groups" | "tenant-groups";

export const getAIToolItems = (): Array<{ key: AIToolKey; label: string }> => {
  return [
    { key: AIToolKey.Metabot, label: t`AI features` },
    { key: AIToolKey.ChatAndNLQ, label: t`Chat and NLQ` },
    { key: AIToolKey.SQLGeneration, label: t`SQL generation` },
    { key: AIToolKey.OtherTools, label: t`Other tools` },
  ];
};

const PERMISSIONS_SAVE_DEBOUNCE = 500;

export const useMetabotGroupPermissions = () => {
  const { data: permissionsQueryData, error: permissionsQueryError } =
    useGetAIControlsGroupPermissionsQuery();
  const [updateMetabotPermissions] =
    useUpdateAIControlsGroupPermissionsMutation();
  const [groupPermissions, setGroupPermissions] = useState<
    MetabotGroupPermission[]
  >([]);
  const { sendErrorToast } = useMetadataToasts();

  const advanced = permissionsQueryData?.advanced ?? false;
  const prevAdvancedRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    const { permissions } = permissionsQueryData || {};
    if (!permissions?.length) {
      return;
    }

    const firstPopulate = groupPermissions.length === 0;
    const modeTransitioned =
      prevAdvancedRef.current !== undefined &&
      prevAdvancedRef.current !== advanced;

    if (firstPopulate || modeTransitioned) {
      setGroupPermissions(permissions);
    }
    prevAdvancedRef.current = advanced;
  }, [permissionsQueryData, advanced, groupPermissions.length]);

  const debouncedUpdatePermissions = useDebouncedCallback(async () => {
    try {
      await updateMetabotPermissions({
        permissions: groupPermissions,
      }).unwrap();
    } catch {
      sendErrorToast(t`Failed to save Metabot permissions`);
    }
  }, PERMISSIONS_SAVE_DEBOUNCE);

  const onPermissionChange = (
    groupId: number,
    tool: AIToolKey,
    value: "yes" | "no",
  ) => {
    setGroupPermissions((prevPermissions) => {
      return prevPermissions.map((permission) => {
        if (permission.group_id === groupId && permission.perm_type === tool) {
          return {
            ...permission,
            perm_value: value,
          } as MetabotGroupPermission;
        }

        return permission;
      });
    });
    debouncedUpdatePermissions();
  };

  return {
    groupPermissions,
    onPermissionChange,
    advanced,
    error: permissionsQueryError ? t`Failed to load Metabot permissions` : null,
  };
};
