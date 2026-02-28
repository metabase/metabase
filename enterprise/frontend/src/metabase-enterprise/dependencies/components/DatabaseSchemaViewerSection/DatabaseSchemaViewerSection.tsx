import { t } from "ttag";

import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import type { DatabaseSchemaViewerSectionProps } from "metabase/plugins";
import { Button, Flex, Text } from "metabase/ui";

export function DatabaseSchemaViewerSection({
  database: _database,
}: DatabaseSchemaViewerSectionProps) {
  return (
    <DatabaseInfoSection
      condensed
      name={t`Schema viewer`}
      description={t`View the table relationships and schema structure for this database.`}
      data-testid="database-schema-viewer-section"
    >
      <Flex align="center" justify="space-between" gap="lg">
        <Text c="text-secondary">
          {t`Explore the entity relationship diagram for tables in this database.`}
        </Text>
        <Button
          component={ForwardRefLink}
          to={Urls.dataStudioErdBase()}
          style={{ flexShrink: 0 }}
        >{t`Open schema viewer`}</Button>
      </Flex>
    </DatabaseInfoSection>
  );
}
