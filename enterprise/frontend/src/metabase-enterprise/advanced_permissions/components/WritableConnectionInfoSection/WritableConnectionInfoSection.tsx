import { Link } from "react-router";
import { t } from "ttag";

import { DatabaseConnectionHealthInfo } from "metabase/admin/databases/components/DatabaseConnectionHealthInfo";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { isDbModifiable } from "metabase/admin/databases/utils";
import * as Urls from "metabase/lib/urls";
import type { WriteDataConnectionSectionProps } from "metabase/plugins/oss/permissions";
import { Button, Flex } from "metabase/ui";

export function WriteDataConnectionSection({
  database,
}: WriteDataConnectionSectionProps) {
  const hasWritableConnection = database.write_data_details !== null;

  if (!isDbModifiable(database)) {
    return null;
  }

  return (
    <DatabaseInfoSection
      name={t`Writable connection`}
      description={t`Manage the writable connection for this database.`}
    >
      <Flex align="center" justify="space-between" gap="lg">
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
      </Flex>

      {hasWritableConnection && (
        <>
          <DatabaseInfoSectionDivider condensed />
          <Button variant="filled" color="error">
            {t`Remove writable connection`}
          </Button>
        </>
      )}
    </DatabaseInfoSection>
  );
}
