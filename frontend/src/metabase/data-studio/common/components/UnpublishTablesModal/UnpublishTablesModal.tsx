import { jt, t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Box,
  Button,
  FocusTrap,
  Group,
  List,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import {
  useGetTableSelectionInfoQuery,
  useUnpublishTablesMutation,
} from "metabase-enterprise/api";
import { trackDataStudioTableUnpublished } from "metabase-enterprise/data-studio/analytics";
import type {
  BulkTableInfo,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

type UnpublishTablesModalProps = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
  isOpened: boolean;
  onUnpublish: () => void;
  onClose: () => void;
};

export function UnpublishTablesModal({
  databaseIds,
  schemaIds,
  tableIds,
  isOpened,
  onUnpublish,
  onClose,
}: UnpublishTablesModalProps) {
  return (
    <Modal
      title={
        <ModalTitle
          databaseIds={databaseIds}
          schemaIds={schemaIds}
          tableIds={tableIds}
        />
      }
      opened={isOpened}
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <ModalBody
        databaseIds={databaseIds}
        schemaIds={schemaIds}
        tableIds={tableIds}
        onUnpublish={onUnpublish}
        onClose={onClose}
      />
    </Modal>
  );
}

type ModalTitleProps = {
  databaseIds: DatabaseId[] | undefined;
  schemaIds: SchemaId[] | undefined;
  tableIds: TableId[] | undefined;
};

function ModalTitle({ databaseIds, schemaIds, tableIds }: ModalTitleProps) {
  const { data } = useGetTableSelectionInfoQuery({
    database_ids: databaseIds,
    schema_ids: schemaIds,
    table_ids: tableIds,
  });
  if (!data) {
    return null;
  }

  const { selected_table, published_downstream_tables } = data;
  return <>{getTitle(selected_table, published_downstream_tables)}</>;
}

type ModalBodyProps = {
  databaseIds: DatabaseId[] | undefined;
  schemaIds: SchemaId[] | undefined;
  tableIds: TableId[] | undefined;
  onUnpublish: () => void;
  onClose: () => void;
};

function ModalBody({
  databaseIds,
  schemaIds,
  tableIds,
  onUnpublish,
  onClose,
}: ModalBodyProps) {
  const { data, isLoading, error } = useGetTableSelectionInfoQuery({
    database_ids: databaseIds,
    schema_ids: schemaIds,
    table_ids: tableIds,
  });
  const [unpublishTables] = useUnpublishTablesMutation();
  const { sendSuccessToast } = useMetadataToasts();

  if (isLoading || error != null || data == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const { selected_table, published_downstream_tables } = data;

  const handleSubmit = async () => {
    await unpublishTables({
      database_ids: databaseIds,
      schema_ids: schemaIds,
      table_ids: tableIds,
    }).unwrap();
    sendSuccessToast(t`Unpublished`);
    trackDataStudioTableUnpublished();
    onUnpublish();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="sm">
          <Text>
            {getInfoMessage(selected_table, published_downstream_tables)}
          </Text>
          {published_downstream_tables.length > 0 && (
            <>
              <Text>{getForeignKeyMessage(selected_table)}</Text>
              <List spacing="sm">
                {published_downstream_tables.map((table) => (
                  <List.Item key={table.id} fw="bold">
                    {table.display_name}
                  </List.Item>
                ))}
              </List>
            </>
          )}
        </Stack>
        <Group mt="xl" gap="sm" wrap="nowrap">
          <Box flex={1}>
            <FormErrorMessage />
          </Box>
          <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
          <FormSubmitButton
            label={getSubmitButtonLabel(
              selected_table,
              published_downstream_tables,
            )}
            variant="filled"
            color="error"
          />
        </Group>
      </Form>
    </FormProvider>
  );
}

function getTitle(
  selectedTable: BulkTableInfo | null,
  publishedRemappedTables: BulkTableInfo[],
) {
  if (selectedTable != null) {
    return publishedRemappedTables.length > 0
      ? t`Unpublish ${selectedTable.display_name} and the tables that depend on it?`
      : t`Unpublish ${selectedTable.display_name}?`;
  }

  return publishedRemappedTables.length > 0
    ? t`Unpublish these tables and the tables that depend on them?`
    : t`Unpublish these tables?`;
}

function getInfoMessage(
  selectedTable: BulkTableInfo | null,
  publishedRemappedTables: BulkTableInfo[],
) {
  return selectedTable != null && publishedRemappedTables.length === 0
    ? t`This will remove this table from the Library.`
    : t`This will remove these tables from the Library.`;
}

function getForeignKeyMessage(selectedTable: BulkTableInfo | null) {
  return selectedTable != null
    ? jt`Because values in ${(
        <strong key="table">{selectedTable.display_name}</strong>
      )} are used as display values in other published tables, you'll need to unpublish these, too:`
    : t`Because values in some of the tables you've selected are used as display values in other published tables, you'll need to unpublish the tables below, too:`;
}

function getSubmitButtonLabel(
  selectedTable: BulkTableInfo | null,
  publishedRemappedTables: BulkTableInfo[],
) {
  return selectedTable != null && publishedRemappedTables.length === 0
    ? t`Unpublish this table`
    : t`Unpublish these tables`;
}
