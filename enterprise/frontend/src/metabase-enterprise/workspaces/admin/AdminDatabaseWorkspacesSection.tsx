import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import {
  Description,
  Error,
  Label,
} from "metabase/admin/databases/components/DatabaseFeatureComponents";
import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { useCheckWorkspacePermissionsMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Flex, List, Stack, Switch } from "metabase/ui";
import type {
  Database,
  DatabaseData,
  DatabaseId,
  DatabaseLocalSettingAvailability,
} from "metabase-types/api";

import { DATABASE_WORKSPACES_SETTING } from "../settings";

export function AdminDatabaseWorkspacesSection({
  database,
  settingsAvailable,
  updateDatabase,
}: {
  database: Database;
  settingsAvailable?: Record<string, DatabaseLocalSettingAvailability>;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseData>,
  ) => Promise<void>;
}) {
  const isEnabled = Boolean(database.settings?.[DATABASE_WORKSPACES_SETTING]);
  const workspacesSetting = settingsAvailable?.[DATABASE_WORKSPACES_SETTING];
  const isSettingDisabled = !workspacesSetting;

  const [error, setError] = useState<string | null>(null);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);

  const [checkWorkspacePermissions] = useCheckWorkspacePermissionsMutation();

  const enableWorkspaces = async () => {
    await updateDatabase({
      id: database.id,
      settings: { [DATABASE_WORKSPACES_SETTING]: true },
    });
  };

  const disableWorkspaces = async () => {
    await updateDatabase({
      id: database.id,
      settings: { [DATABASE_WORKSPACES_SETTING]: false },
    });
  };

  const tryToEnableWorkspaces = async () => {
    setIsCheckingPermissions(true);

    try {
      const result = await checkWorkspacePermissions({
        id: database.id,
        cached: false,
      }).unwrap();

      if (result.status === "ok") {
        await enableWorkspaces();
      } else {
        setPermissionsError(
          getErrorMessage(
            result.error,
            t`This database connection does not have sufficient permissions`,
          ),
        );
      }
    } catch (error) {
      setPermissionsError(
        getErrorMessage(
          error,
          t`Failed to check workspace permissions for this database`,
        ),
      );
    } finally {
      setIsCheckingPermissions(false);
    }
  };

  const handleToggle = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      setError(null);
      setPermissionsError(null);

      if (event.target.checked) {
        await tryToEnableWorkspaces();
      } else {
        await disableWorkspaces();
      }
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  if (!isSettingDisabled) {
    return null;
  }

  return (
    <DatabaseInfoSection
      data-testid="database-workspaces-section"
      description={t`Enable workspaces for this database to create isolated data environments for transforms.`}
      name={t`Workspaces`}
    >
      <Stack gap="md">
        <Flex align="center" justify="space-between">
          <Label htmlFor="workspaces-toggle">{t`Enable workspaces`}</Label>

          <Switch
            checked={isEnabled}
            disabled={isCheckingPermissions}
            id="workspaces-toggle"
            onChange={handleToggle}
          />
        </Flex>

        <Stack maw="22.5rem">
          {!permissionsError && (
            <Description>
              {t`Your database connection will need permissions to create users, schemas, and grant table permissions.`}
            </Description>
          )}

          {permissionsError && (
            <Stack c="text-secondary" gap="xs" lh={1.4}>
              {t`To enable workspaces, the database connection user needs permissions to:`}

              <List>
                <List.Item
                  c="text-secondary"
                  lh={1.4}
                >{t`Create users and schemas`}</List.Item>
                <List.Item
                  c="text-secondary"
                  lh={1.4}
                >{t`Grant table permissions`}</List.Item>
                <List.Item
                  c="text-secondary"
                  lh={1.4}
                >{t`Manage database resources`}</List.Item>
              </List>
            </Stack>
          )}

          {error && <Error>{error}</Error>}

          {permissionsError && <Error>{permissionsError}</Error>}
        </Stack>
      </Stack>
    </DatabaseInfoSection>
  );
}
