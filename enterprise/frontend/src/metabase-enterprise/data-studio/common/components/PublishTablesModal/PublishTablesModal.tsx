import { jt, t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, Group, List, Modal, Stack, Text } from "metabase/ui";
import {
  useGetTableSelectionInfoQuery,
  usePublishTablesMutation,
} from "metabase-enterprise/api";
import type {
  DatabaseId,
  PublishTableInfo,
  SchemaId,
  TableId,
} from "metabase-types/api";

type PublishTablesModalProps = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
  isOpened: boolean;
  onPublish: () => void;
  onClose: () => void;
};

export function PublishTablesModal({
  databaseIds,
  schemaIds,
  tableIds,
  isOpened,
  onPublish,
  onClose,
}: PublishTablesModalProps) {
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
      <ModalBody
        databaseIds={databaseIds}
        schemaIds={schemaIds}
        tableIds={tableIds}
        onPublish={onPublish}
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

  const { unpublished_tables, unpublished_downstream_tables } = data;
  return <>{getTitle(unpublished_tables, unpublished_downstream_tables)}</>;
}

type ModalBodyProps = {
  databaseIds: DatabaseId[] | undefined;
  schemaIds: SchemaId[] | undefined;
  tableIds: TableId[] | undefined;
  onPublish: () => void;
  onClose: () => void;
};

function ModalBody({
  databaseIds,
  schemaIds,
  tableIds,
  onPublish,
  onClose,
}: ModalBodyProps) {
  const { data, isLoading, error } = useGetTableSelectionInfoQuery({
    database_ids: databaseIds,
    schema_ids: schemaIds,
    table_ids: tableIds,
  });
  const [publishTables] = usePublishTablesMutation();

  if (isLoading || error != null || data == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const { unpublished_tables, unpublished_downstream_tables } = data;

  const handleSubmit = async () => {
    await publishTables({
      database_ids: databaseIds,
      schema_ids: schemaIds,
      table_ids: tableIds,
    }).unwrap();
    onPublish();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack>
          <Text>{t`Publishing a table saves it to the Library.`}</Text>
          {unpublished_downstream_tables.length > 0 && (
            <>
              <Text>{getForeignKeyMessage(unpublished_tables)}</Text>
              <List spacing="sm">
                {unpublished_downstream_tables.map((table) => (
                  <List.Item key={table.id}>{table.display_name}</List.Item>
                ))}
              </List>
            </>
          )}
          <Group wrap="nowrap">
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={getSubmitButtonLabel(
                unpublished_tables,
                unpublished_downstream_tables,
              )}
              variant="filled"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getTitle(
  unpublishedTables: PublishTableInfo[],
  unpublishedRemappedTables: PublishTableInfo[],
) {
  if (unpublishedTables.length === 1) {
    return unpublishedRemappedTables.length > 0
      ? t`Publish ${unpublishedTables[0].display_name} and the tables it depends on?`
      : t`Publish ${unpublishedTables[0].display_name}?`;
  }

  return unpublishedRemappedTables.length > 0
    ? t`Publish these tables and the tables they depend on?`
    : t`Publish these tables?`;
}

function getForeignKeyMessage(unpublishedTables: PublishTableInfo[]) {
  return unpublishedTables.length === 1
    ? jt`Because ${(
        <strong key="table">{unpublishedTables[0].display_name}</strong>
      )} uses foreign keys to display values from other tables, you'll need to publish these, too:`
    : t`Because some of the tables you've selected use foreign keys to display values from other tables, you'll need to publish the tables below, too:`;
}

function getSubmitButtonLabel(
  unpublishedTables: PublishTableInfo[],
  unpublishedRemappedTables: PublishTableInfo[],
) {
  return unpublishedTables.length === 1 &&
    unpublishedRemappedTables.length === 0
    ? t`Publish this table`
    : t`Publish these tables`;
}
