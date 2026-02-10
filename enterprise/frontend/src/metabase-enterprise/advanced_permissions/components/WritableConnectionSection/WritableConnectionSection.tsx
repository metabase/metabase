import { Link } from "react-router";
import { t } from "ttag";

import { DatabaseConnectionHealthInfo } from "metabase/admin/databases/components/DatabaseConnectionHealthInfo";
import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { isDbModifiable } from "metabase/admin/databases/utils";
import * as Urls from "metabase/lib/urls";
import type { WritableConnectionSectionProps } from "metabase/plugins/oss/permissions";
import { Button, Flex } from "metabase/ui";

export function WritableConnectionSection({
  database,
}: WritableConnectionSectionProps) {
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
            : t`Add connection details`}
        </Button>
      </Flex>
    </DatabaseInfoSection>
  );
}
