import { t } from "ttag";

import { Modal, Stack, Text, rem } from "metabase/ui";
import type { TableId } from "metabase-types/api";

import { DiscardTableFieldValuesButton } from "../DiscardTableFieldValuesButton";
import { RescanTableFieldsButton } from "../RescanTableFieldsButton";
import { SyncTableSchemaButton } from "../SyncTableSchemaButton";

type SyncOptionsModalProps = {
  isOpen: boolean;
  tableId: TableId;
  onClose: () => void;
};

export const SyncOptionsModal = ({
  isOpen,
  tableId,
  onClose,
}: SyncOptionsModalProps) => {
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
            <Text fw="bold">{t`Re-sync schema`}</Text>

            <Text c="text-secondary" size="sm">
              {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin settings */}
              {t`If you’ve made changes to this table in the underlying database that aren’t showing up in Metabase yet, re-syncing the schema can fix that.`}
            </Text>
          </Stack>

          <SyncTableSchemaButton tableId={tableId} />
        </Stack>

        <Stack gap="md">
          <Stack gap="xs">
            <Text fw="bold">{t`Scan field values`}</Text>

            <Text c="text-secondary" size="sm">
              {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin settings */}
              {t`Metabase can scan the values in this table to enable checkbox filters in dashboards and questions.`}
            </Text>
          </Stack>

          <RescanTableFieldsButton tableId={tableId} />

          <DiscardTableFieldValuesButton tableId={tableId} />
        </Stack>
      </Stack>
    </Modal>
  );
};
