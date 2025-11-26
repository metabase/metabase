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
  tables?: Set<TableId>;
  schemas?: Set<SchemaId>;
  databases?: Set<DatabaseId>;
  isOpen: boolean;
  onClose: () => void;
};

export function UnpublishTablesModal({
  tables = new Set(),
  schemas = new Set(),
  databases = new Set(),
  isOpen,
  onClose,
}: UnpublishTablesModalProps) {
  const [unpublishTables] = useUnpublishTablesMutation();
  const { sendSuccessToast } = useMetadataToasts();

  const handleSubmit = async () => {
    const action = unpublishTables({
      table_ids: Array.from(tables),
      schema_ids: Array.from(schemas),
      database_ids: Array.from(databases),
    });
    await action.unwrap();
    sendSuccessToast(t`Un-published successfully`);
    onClose();
  };

  return (
    <Modal
      title={getTitle(tables, schemas, databases)}
      opened={isOpen}
      padding="xl"
      onClose={onClose}
    >
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Stack>
            <Text>
              {t`Un-publishing a table removes it from the collection where it was published.`}
            </Text>
            <Group wrap="nowrap">
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <Button variant="subtle">{t`Cancel`}</Button>
              <FormSubmitButton
                variant="filled"
                color="error"
                label={t`Un-publish`}
              />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}

function getTitle(
  tables: Set<TableId>,
  schemas: Set<SchemaId>,
  databases: Set<DatabaseId>,
) {
  if (schemas.size === 0 && databases.size === 0) {
    return ngettext(
      msgid`Un-publish this table?`,
      `Un-publish these ${tables.size} tables?`,
      tables.size,
    );
  }
  return t`Un-publish these tables?`;
}
