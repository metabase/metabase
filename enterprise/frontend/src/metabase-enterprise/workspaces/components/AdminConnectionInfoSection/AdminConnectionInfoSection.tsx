import { Link } from "react-router";
import { t } from "ttag";

import { DatabaseConnectionHealthInfo } from "metabase/admin/databases/components/DatabaseConnectionHealthInfo";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { useUpdateDatabaseMutation } from "metabase/api";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useToast } from "metabase/common/hooks/use-toast";
import {
  hasDbRoutingEnabled,
  hasFeature,
  isDbModifiable,
} from "metabase/common/utils/database";
import type { AdminConnectionInfoSectionProps } from "metabase/plugins/oss/workspaces";
import { Alert, Button, FixedSizeIcon, Group } from "metabase/ui";
import * as Urls from "metabase/urls";

export function AdminConnectionInfoSection({
  database,
}: AdminConnectionInfoSectionProps) {
  const hasAdminConnection = database.admin_details != null;
  const [updateDatabase] = useUpdateDatabaseMutation();
  const { modalContent, show: showConfirmation } = useConfirmation();
  const [sendToast] = useToast();
  const isDbRoutingEnabled = hasDbRoutingEnabled(database);

  if (!isDbModifiable(database) || !hasFeature(database, "workspace")) {
    return null;
  }

  const handleRemove = () => {
    showConfirmation({
      title: t`Remove admin connection?`,
      message: t`This will remove the admin connection for this database. Any features that depend on it will stop working.`,
      confirmButtonText: t`Remove`,
      onConfirm: async () => {
        try {
          await updateDatabase({
            id: database.id,
            admin_details: null,
          }).unwrap();
        } catch {
          sendToast({
            message: t`Failed to remove admin connection`,
            toastColor: "error",
            icon: "warning",
          });
        }
      },
    });
  };

  return (
    <DatabaseInfoSection
      name={t`Admin connection`}
      description={t`Admin connection is used to create a temporary user and an isolation schema for a workspace.`}
      data-testid="admin-connection-info-section"
    >
      <Group justify="space-between" gap="lg">
        {hasAdminConnection && (
          <DatabaseConnectionHealthInfo
            databaseId={database.id}
            connectionType="admin"
          />
        )}
        <Button
          component={isDbRoutingEnabled ? undefined : Link}
          to={Urls.editDatabaseAdminConnection(database.id)}
          disabled={isDbRoutingEnabled}
        >
          {hasAdminConnection
            ? t`Edit connection details`
            : t`Add admin connection`}
        </Button>
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
            {t`Admin connection can't be enabled when Database Routing is enabled.`}
          </Alert>
        </>
      )}

      {hasAdminConnection && (
        <>
          <DatabaseInfoSectionDivider condensed />
          <Group>
            <Button variant="filled" color="error" onClick={handleRemove}>
              {t`Remove admin connection`}
            </Button>
          </Group>
        </>
      )}
      {modalContent}
    </DatabaseInfoSection>
  );
}
