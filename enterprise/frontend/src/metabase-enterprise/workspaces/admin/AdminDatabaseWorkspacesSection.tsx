import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import {
  Description,
  Error,
  Label,
} from "metabase/admin/databases/components/DatabaseFeatureComponents";
import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { useCheckWorkspacePermissionsMutation } from "metabase/api";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { Box, Button, Flex, Stack, Switch } from "metabase/ui";
import type {
  Database,
  DatabaseData,
  DatabaseId,
  DatabaseLocalSettingAvailability,
} from "metabase-types/api";

import {
  DATABASE_WORKSPACES_SETTING,
  isDatabaseWorkspacesEnabled,
} from "../settings";

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
  const [error, setError] = useState<string | null>(null);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);

  const [checkWorkspacePermissions] = useCheckWorkspacePermissionsMutation();

  const workspacesSetting = settingsAvailable?.[DATABASE_WORKSPACES_SETTING];
  const isSettingDisabled =
    !workspacesSetting || workspacesSetting.enabled === false;

  const firstDisabledReason =
    workspacesSetting?.enabled === false
      ? workspacesSetting?.reasons?.[0]
      : undefined;

  const permissionsStatus = database.workspace_permissions_status?.status;
  const hasPermissionsError =
    permissionsStatus === "failed" || permissionsStatus === "unknown";

  const handleToggle = async (event: ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;

    try {
      setError(null);
      setPermissionsError(null);

      if (enabled) {
        // When enabling, first check permissions
        setIsCheckingPermissions(true);
        try {
          const result = await checkWorkspacePermissions({
            id: database.id,
            cached: true,
          }).unwrap();

          if (result.status === "failed" || result.status === "unknown") {
            setPermissionsError(
              result.error ||
                t`Workspace connection must be tested explicitly.`,
            );
            setIsCheckingPermissions(false);
            return;
          }

          // Permissions are OK, proceed with enabling
          await updateDatabase({
            id: database.id,
            settings: { [DATABASE_WORKSPACES_SETTING]: true },
          });
        } catch (err) {
          const errorMessage = getResponseErrorMessage(err);
          setPermissionsError(
            errorMessage || t`Failed to check workspace permissions`,
          );
          setIsCheckingPermissions(false);
          return;
        } finally {
          setIsCheckingPermissions(false);
        }
      } else {
        // When disabling, just update the setting
        await updateDatabase({
          id: database.id,
          settings: { [DATABASE_WORKSPACES_SETTING]: false },
        });
      }
    } catch (err) {
      setError(getResponseErrorMessage(err) || t`An error occurred`);
    }
  };

  const handleRetryEnabling = async () => {
    try {
      setError(null);
      setPermissionsError(null);
      setIsCheckingPermissions(true);

      // Bust cache and re-check permissions
      const result = await checkWorkspacePermissions({
        id: database.id,
        cached: false,
      }).unwrap();

      if (result.status === "failed" || result.status === "unknown") {
        setPermissionsError(
          result.error || t`Workspace connection must be tested explicitly.`,
        );
        setIsCheckingPermissions(false);
        return;
      }

      // Permissions are OK, enable workspaces
      await updateDatabase({
        id: database.id,
        settings: { [DATABASE_WORKSPACES_SETTING]: true },
      });
    } catch (err) {
      const errorMessage = getResponseErrorMessage(err);
      setPermissionsError(
        errorMessage || t`Failed to check workspace permissions`,
      );
    } finally {
      setIsCheckingPermissions(false);
    }
  };

  if (!workspacesSetting) {
    return null;
  }

  const isEnabled = isDatabaseWorkspacesEnabled(database);
  const showPermissionsError = hasPermissionsError && isEnabled === false;

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
            disabled={isSettingDisabled || isCheckingPermissions}
            id="workspaces-toggle"
            value={isEnabled}
            onChange={handleToggle}
          />
        </Flex>

        <Box maw="22.5rem">
          {error ? <Error>{error}</Error> : null}
          {permissionsError ? <Error>{permissionsError}</Error> : null}

          {showPermissionsError ? (
            <Stack gap="md">
              <Description>
                {t`To enable workspaces, the database connection user needs permissions to:
• Create users and schemas
• Grant table permissions
• Manage database resources`}
              </Description>
              <Button
                onClick={handleRetryEnabling}
                loading={isCheckingPermissions}
                variant="filled"
              >
                {t`Retry enabling`}
              </Button>
            </Stack>
          ) : (
            <Description>
              {firstDisabledReason?.message ??
                t`Your database connection will need permissions to create users, schemas, and grant table permissions.`}
            </Description>
          )}
        </Box>
      </Stack>
    </DatabaseInfoSection>
  );
}
