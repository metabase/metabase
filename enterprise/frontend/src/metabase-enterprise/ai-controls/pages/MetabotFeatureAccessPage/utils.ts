import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useGetAIControlsGroupPermissionsQuery,
  useUpdateAIControlsGroupPermissionsMutation,
} from "metabase-enterprise/api";
import { AIToolKey, type MetabotGroupPermission } from "metabase-types/api";

export type GroupTab = "user-groups" | "tenant-groups";

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
  const prevAdvanced = usePrevious(advanced);
  const modeTransitioned =
    prevAdvanced !== undefined && prevAdvanced !== advanced;

  useEffect(() => {
    const { permissions } = permissionsQueryData || {};

    if (!permissions?.length) {
      return;
    }

    const uninitialized = groupPermissions.length === 0;

    if (uninitialized) {
      setGroupPermissions(permissions);
    }
  }, [permissionsQueryData, groupPermissions.length]);

  useEffect(() => {
    const { permissions } = permissionsQueryData || {};

    if (!permissions?.length) {
      return;
    }

    if (modeTransitioned) {
      setGroupPermissions(permissions);
    }
  }, [modeTransitioned, permissionsQueryData]);

  const debouncedUpdatePermissions = useDebouncedCallback(async () => {
    try {
      await updateMetabotPermissions({
        permissions: groupPermissions,
      }).unwrap();
    } catch {
      sendErrorToast(t`Failed to save Metabot permissions`);
    }
  }, PERMISSIONS_SAVE_DEBOUNCE);

  const onPermissionChange = useCallback(
    (groupId: number, tool: AIToolKey, value: "yes" | "no") => {
      setGroupPermissions((prevPermissions) => {
        const allToolsDisabledForGroup = prevPermissions
          .filter(
            (permission) =>
              permission.group_id === groupId &&
              permission.perm_type !== AIToolKey.Metabot,
          )
          .every((permission) =>
            permission.perm_type === tool
              ? value === "no"
              : permission.perm_value === "no",
          );

        return prevPermissions.map((permission) => {
          if (tool === AIToolKey.Metabot && permission.group_id === groupId) {
            /**
             * When metabot is enabled for the group, all tools are also enabled.
             * Likewise, when metabot is disabled for the group, all tools are disabled.
             */
            return {
              ...permission,
              perm_value: value,
            };
          }

          if (
            permission.perm_type !== tool &&
            permission.perm_type === AIToolKey.Metabot &&
            permission.group_id === groupId
          ) {
            /**
             * When metabot is disabled, and then the user enables a tool,
             * metabot will be automatically enabled for the group.
             */
            if (value === "yes" && permission.perm_value === "no") {
              return {
                ...permission,
                perm_value: "yes",
              };
            }

            /**
             * When all features get disabled, disable Metabot for that group.
             */
            if (allToolsDisabledForGroup) {
              return {
                ...permission,
                perm_value: "no",
              };
            }

            return permission;
          }

          if (
            permission.group_id === groupId &&
            permission.perm_type === tool
          ) {
            return {
              ...permission,
              perm_value: value,
            };
          }

          return permission;
        });
      });
      debouncedUpdatePermissions();
    },
    [debouncedUpdatePermissions],
  );

  return {
    groupPermissions,
    onPermissionChange,
    advanced,
    error: permissionsQueryError ? t`Failed to load Metabot permissions` : null,
  };
};
