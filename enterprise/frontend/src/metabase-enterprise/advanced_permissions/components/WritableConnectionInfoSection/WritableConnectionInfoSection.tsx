import { Link } from "react-router";
import { t } from "ttag";

import { DatabaseConnectionHealthInfo } from "metabase/admin/databases/components/DatabaseConnectionHealthInfo";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import {
  hasDbRoutingEnabled,
  isDbModifiable,
} from "metabase/admin/databases/utils";
import { useUpdateDatabaseMutation } from "metabase/api";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import * as Urls from "metabase/lib/urls";
import type { WritableConnectionInfoSectionProps } from "metabase/plugins/oss/permissions";
import { Alert, Button, Group, Icon } from "metabase/ui";

export function WritableConnectionInfoSection({
  database,
}: WritableConnectionInfoSectionProps) {
  const hasWritableConnection = database.write_data_details !== null;
  const [updateDatabase] = useUpdateDatabaseMutation();
  const { modalContent, show: showConfirmation } = useConfirmation();
  const isDbRoutingEnabled = hasDbRoutingEnabled(database);

  if (!isDbModifiable(database)) {
    return null;
  }

  const handleRemove = () => {
    showConfirmation({
      title: t`Remove writable connection?`,
      message: t`This will remove the writable connection for this database. Any actions that depend on it will stop working.`,
      confirmButtonText: t`Remove`,
      onConfirm: async () => {
        await updateDatabase({
          id: database.id,
          write_data_details: null,
        }).unwrap();
      },
    });
  };

  return (
    <DatabaseInfoSection
      name={t`Writable connection`}
      description={t`You can add a separate writable connection to use with features like transforms and editable tables.`}
    >
      <Group justify="space-between" gap="lg">
        {hasWritableConnection && (
          <DatabaseConnectionHealthInfo
            databaseId={database.id}
            connectionType="write-data"
          />
        )}
        <Button
          component={isDbRoutingEnabled ? undefined : Link}
          to={Urls.editDatabaseWritableConnection(database.id)}
          disabled={isDbRoutingEnabled}
        >
          {hasWritableConnection
            ? t`Edit connection details`
            : t`Add writable connection`}
        </Button>
      </Group>

      {isDbRoutingEnabled && (
        <>
          <DatabaseInfoSectionDivider />
          <Alert
            variant="light"
            color="info"
            icon={<Icon name="info" />}
            mb="md"
          >
            {t`Writable connection can't be enabled when Database Routing is enabled.`}
          </Alert>
        </>
      )}

      {hasWritableConnection && (
        <>
          <DatabaseInfoSectionDivider condensed />
          <Group>
            <Button variant="filled" color="error" onClick={handleRemove}>
              {t`Remove writable connection`}
            </Button>
          </Group>
        </>
      )}
      {modalContent}
    </DatabaseInfoSection>
  );
}
