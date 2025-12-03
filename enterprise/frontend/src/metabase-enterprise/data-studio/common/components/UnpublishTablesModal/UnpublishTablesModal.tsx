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

  const { published_tables, unpublished_tables, published_downstream_tables } =
    data;
  const selectedTables = [...published_tables, ...unpublished_tables];
  return <>{getTitle(selectedTables, published_downstream_tables)}</>;
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

  const { published_tables, unpublished_tables, published_downstream_tables } =
    data;
  const selectedTables = [...published_tables, ...unpublished_tables];

  const handleSubmit = async () => {
    await unpublishTables({
      database_ids: databaseIds,
      schema_ids: schemaIds,
      table_ids: tableIds,
    }).unwrap();
    sendSuccessToast(t`Unpublished`);
    onUnpublish();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="sm">
          <Text>
            {getInfoMessage(selectedTables, published_downstream_tables)}
          </Text>
          {published_downstream_tables.length > 0 && (
            <>
              <Text>{getForeignKeyMessage(selectedTables)}</Text>
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
              selectedTables,
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
  selectedTables: BulkTableInfo[],
  publishedRemappedTables: BulkTableInfo[],
) {
  if (selectedTables.length === 1) {
    return publishedRemappedTables.length > 0
      ? t`Unpublish ${selectedTables[0].display_name} and the tables that depend on it?`
      : t`Unpublish ${selectedTables[0].display_name}?`;
  }

  return publishedRemappedTables.length > 0
    ? t`Unpublish these tables and the tables that depend on them?`
    : t`Unpublish these tables?`;
}

function getInfoMessage(
  selectedTables: BulkTableInfo[],
  publishedRemappedTables: BulkTableInfo[],
) {
  return selectedTables.length === 1 && publishedRemappedTables.length === 0
    ? t`This will remove this table from the Library.`
    : t`This will remove these tables from the Library.`;
}

function getForeignKeyMessage(selectedTables: BulkTableInfo[]) {
  return selectedTables.length === 1
    ? jt`Because values in ${(
        <strong key="table">{selectedTables[0].display_name}</strong>
      )} are used as display values in other published tables, you'll need to unpublish these, too:`
    : t`Because values in some of the tables you've selected are used as display values in other published tables, you'll need to unpublish the tables below, too:`;
}

function getSubmitButtonLabel(
  selectedTables: BulkTableInfo[],
  publishedRemappedTables: BulkTableInfo[],
) {
  return selectedTables.length === 1 && publishedRemappedTables.length === 0
    ? t`Unpublish this table`
    : t`Unpublish these tables`;
}
