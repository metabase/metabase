import { msgid, ngettext, t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Group, Modal, Stack, Text } from "metabase/ui";
import { useUnpublishTablesMutation } from "metabase-enterprise/api";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

type UnpublishTablesModalProps = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
  onUnpublish?: () => void;
  onClose: () => void;
};

export function UnpublishTablesModal({
  databaseIds = [],
  schemaIds = [],
  tableIds = [],
  onUnpublish,
  onClose,
}: UnpublishTablesModalProps) {
  const [unpublishTables] = useUnpublishTablesMutation();
  const { sendSuccessToast } = useMetadataToasts();

  const handleSubmit = async () => {
    const action = unpublishTables({
      database_ids: databaseIds,
      schema_ids: schemaIds,
      table_ids: tableIds,
    });
    await action.unwrap();
    sendSuccessToast(t`Unpublished`);
    onUnpublish?.();
    onClose();
  };

  return (
    <Modal
      title={getTitle(databaseIds, schemaIds, tableIds)}
      opened
      padding="xl"
      onClose={onClose}
    >
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Stack>
            <Text>
              {t`This will remove this table from the Library. Any queries that use this table will still work.`}
            </Text>
            <Group wrap="nowrap">
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <Button variant="subtle">{t`Cancel`}</Button>
              <FormSubmitButton
                variant="filled"
                color="error"
                label={t`Unpublish`}
              />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}

function getTitle(
  databaseIds: DatabaseId[],
  schemaIds: SchemaId[],
  tableIds: TableId[],
) {
  if (schemaIds.length === 0 && databaseIds.length === 0) {
    return ngettext(
      msgid`Unpublish this table?`,
      `Unpublish these ${tableIds.length} tables?`,
      tableIds.length,
    );
  }
  return t`Unpublish these tables?`;
}
