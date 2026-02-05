import { t } from "ttag";

import { Modal, Stack, Text, rem } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import { DiscardTableFieldValuesButton } from "./DiscardTableFieldValuesButton";
import { RescanTableFieldsButton } from "./RescanTableFieldsButton";
import { SyncTableSchemaButton } from "./SyncTableSchemaButton";

interface Props {
  isOpen: boolean;
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
  onClose: () => void;
}

export const SyncOptionsModal = ({
  isOpen,
  databaseIds,
  schemaIds,
  tableIds,
  onClose,
}: Props) => {
  const isSingleTable =
    (databaseIds == null || databaseIds.length === 0) &&
    (schemaIds == null || schemaIds.length === 0) &&
    tableIds != null &&
    tableIds.length === 1;

  return (
    <Modal
      opened={isOpen}
      padding="xl"
      size={rem(512)}
      title={t`Syncing and scanning`}
      onClose={onClose}
    >
      <Stack gap="xl" pt="lg">
        <Stack gap="md">
          <Stack gap="xs">
            <Text fw="bold">
              {isSingleTable ? t`Re-sync schema` : t`Re-sync schemas`}
            </Text>

            <Text c="text-secondary" size="sm">
              {isSingleTable
                ? /* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin settings */
                  t`If you’ve made changes to this table in the underlying database that aren’t showing up in Metabase yet, re-syncing the schema can fix that.`
                : /* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin settings */
                  t`If you've made changes to these tables in the underlying databases that aren't showing up in Metabase yet, re-syncing the schemas can fix that.`}
            </Text>
          </Stack>

          <SyncTableSchemaButton
            databaseIds={databaseIds}
            schemaIds={schemaIds}
            tableIds={tableIds}
          />
        </Stack>

        <Stack gap="md">
          <Stack gap="xs">
            <Text fw="bold">{t`Scan field values`}</Text>

            <Text c="text-secondary" size="sm">
              {isSingleTable
                ? /* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin settings */
                  t`Metabase can scan the values in this table to enable checkbox filters in dashboards and questions.`
                : /* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin settings */
                  t`Metabase can scan the values in these tables to enable checkbox filters in dashboards and questions.`}
            </Text>
          </Stack>

          <RescanTableFieldsButton
            databaseIds={databaseIds}
            schemaIds={schemaIds}
            tableIds={tableIds}
          />

          <DiscardTableFieldValuesButton
            databaseIds={databaseIds}
            schemaIds={schemaIds}
            tableIds={tableIds}
          />
        </Stack>
      </Stack>
    </Modal>
  );
};
