import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useGetAIControlsGroupPermissionsQuery,
  useUpdateAIControlsGroupPermissionsMutation,
} from "metabase-enterprise/api";
import { AIToolKey, type MetabotGroupPermission } from "metabase-types/api";

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
  const [updateGroupPermissions] =
    useUpdateAIControlsGroupPermissionsMutation();
  const [groupPermissions, setGroupPermissions] = useState<
    MetabotGroupPermission[]
  >([]);
  const { sendErrorToast } = useMetadataToasts();

  useEffect(() => {
    const { permissions } = permissionsQueryData || {};
    if (permissions?.length) {
      setGroupPermissions(permissions);
    }
  }, [permissionsQueryData]);

  const debouncedUpdatePermissions = useDebouncedCallback(
    async (updatedPermissions: MetabotGroupPermission[]) => {
      try {
        await updateGroupPermissions({
          permissions: updatedPermissions,
        }).unwrap();
      } catch {
        sendErrorToast(t`Failed to save Metabot permissions`);
      }
    },
    PERMISSIONS_SAVE_DEBOUNCE,
  );

  const onPermissionChange = (
    groupId: number,
    tool: AIToolKey,
    value: "yes" | "no",
  ) => {
    setGroupPermissions((prevPermissions) => {
      const updatedPermissions = prevPermissions.map((permission) => {
        if (permission.group_id === groupId && permission.perm_type === tool) {
          return {
            ...permission,
            perm_value: value,
          } as MetabotGroupPermission;
        }

        return permission;
      });

      debouncedUpdatePermissions(updatedPermissions);

      return updatedPermissions;
    });
  };

  return {
    groupPermissions,
    onPermissionChange,
    error: permissionsQueryError ? t`Failed to load Metabot permissions` : null,
  };
};
