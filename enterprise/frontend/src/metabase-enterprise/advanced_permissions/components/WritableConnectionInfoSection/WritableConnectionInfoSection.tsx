import { Link } from "react-router";
import { t } from "ttag";

import { DatabaseConnectionHealthInfo } from "metabase/admin/databases/components/DatabaseConnectionHealthInfo";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { isDbModifiable } from "metabase/admin/databases/utils";
import { useUpdateDatabaseMutation } from "metabase/api";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import * as Urls from "metabase/lib/urls";
import type { WritableConnectionInfoSectionProps } from "metabase/plugins/oss/permissions";
import { Button, Group } from "metabase/ui";

export function WritableConnectionInfoSection({
  database,
}: WritableConnectionInfoSectionProps) {
  const hasWritableConnection = database.write_data_details !== null;
  const [updateDatabase] = useUpdateDatabaseMutation();
  const { modalContent, show: showConfirmation } = useConfirmation();

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
      description={t`Manage the writable connection for this database.`}
    >
      <Group justify="space-between" gap="lg">
        {hasWritableConnection && (
          <DatabaseConnectionHealthInfo
            databaseId={database.id}
            connectionType="write-data"
          />
        )}
        <Button
          component={Link}
          to={Urls.editDatabaseWritableConnection(database.id)}
        >
          {hasWritableConnection
            ? t`Edit connection details`
            : t`Add writable connection`}
        </Button>
      </Group>

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
