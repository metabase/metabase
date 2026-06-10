import { Link } from "react-router";
import { t } from "ttag";

import { DatabaseConnectionHealthInfo } from "metabase/admin/databases/components/DatabaseConnectionHealthInfo";
import { Label } from "metabase/admin/databases/components/DatabaseFeatureComponents";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { useUpdateDatabaseMutation } from "metabase/api";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useToast } from "metabase/common/hooks/use-toast";
import {
  hasAdminConnectionDetails,
  hasDbRoutingEnabled,
  hasFeature,
  hasWorkspacesEnabled,
  isDbModifiable,
} from "metabase/common/utils/database";
import type { WorkspaceDatabaseSectionProps } from "metabase/plugins/oss/workspaces";
import {
  Alert,
  Box,
  Button,
  FixedSizeIcon,
  Group,
  Stack,
  Switch,
} from "metabase/ui";
import * as Urls from "metabase/urls";

export function WorkspaceDatabaseSection({
  database,
}: WorkspaceDatabaseSectionProps) {
  const [updateDatabase] = useUpdateDatabaseMutation();
  const { modalContent, show: showConfirmation } = useConfirmation();
  const [sendToast] = useToast();

  const isEnabled = hasWorkspacesEnabled(database);
  const hasAdminConnection = hasAdminConnectionDetails(database);
  const isDbRoutingEnabled = hasDbRoutingEnabled(database);

  if (!isDbModifiable(database) || !hasFeature(database, "workspace")) {
    return null;
  }

  const handleToggle = async (value: boolean) => {
    const { error } = await updateDatabase({
      id: database.id,
      settings: { "database-enable-workspaces": value },
    });
    if (error) {
      sendToast({
        message: t`Failed to enable Workspaces`,
        toastColor: "error",
        icon: "warning",
      });
    }
  };

  const handleRemove = () => {
    showConfirmation({
      title: t`Remove connection?`,
      message: t`Any features that depend on it will stop working.`,
      confirmButtonText: t`Remove`,
      onConfirm: async () => {
        const { error } = await updateDatabase({
          id: database.id,
          admin_details: null,
        });
        if (error) {
          sendToast({
            message: t`Failed to remove connection`,
            toastColor: "error",
          });
        }
      },
    });
  };

  return (
    <DatabaseInfoSection
      name={t`Workspaces`}
      description={t`Workspaces isolate transformed tables into a separate schema so you can build and test changes before syncing them back to production.`}
      data-testid="workspace-database-section"
    >
      <Group justify="space-between">
        <Box>
          <Label htmlFor="workspace-enable-toggle">{t`Enable workspaces`}</Label>
        </Box>
        <Switch
          id="workspace-enable-toggle"
          checked={isEnabled}
          disabled={isDbRoutingEnabled}
          onChange={(event) => handleToggle(event.currentTarget.checked)}
        />
      </Group>

      {isDbRoutingEnabled && (
        <>
          <DatabaseInfoSectionDivider />
          <Alert
            variant="light"
            color="info"
            icon={<FixedSizeIcon name="info" />}
            mb="md"
          >
            {t`Workspaces can't be enabled when database routing is enabled.`}
          </Alert>
        </>
      )}

      {isEnabled && (
        <>
          <DatabaseInfoSectionDivider />
          <Stack gap={hasAdminConnection ? "md" : 0}>
            <Box fw="bold" lh="lg">{t`Admin database connection`}</Box>
            <Group justify="space-between">
              {hasAdminConnection ? (
                <DatabaseConnectionHealthInfo
                  databaseId={database.id}
                  connectionType="admin"
                />
              ) : (
                <Box c="text-secondary">
                  {t`Used to create isolated schemas and temporary users for workspaces.`}
                </Box>
              )}
              <Group>
                <Button
                  component={isDbRoutingEnabled ? undefined : Link}
                  to={Urls.editDatabaseAdminConnection(database.id)}
                  disabled={isDbRoutingEnabled}
                >
                  {hasAdminConnection
                    ? t`Edit connection details`
                    : t`Add admin connection`}
                </Button>
                {hasAdminConnection && (
                  <Button variant="filled" color="error" onClick={handleRemove}>
                    {t`Remove admin connection`}
                  </Button>
                )}
              </Group>
            </Group>
          </Stack>
        </>
      )}
      {modalContent}
    </DatabaseInfoSection>
  );
}
