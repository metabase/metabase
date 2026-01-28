import { push } from "react-router-redux";
import { jt, t } from "ttag";

import { useGetTableSelectionInfoQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { trackDataStudioTablePublished } from "metabase/data-studio/analytics";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { PublishTablesModalProps } from "metabase/plugins";
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
import { usePublishTablesMutation } from "metabase-enterprise/api";
import type {
  BulkTableInfo,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

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
      <FocusTrap.InitialFocus />
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

  const { selected_table, unpublished_upstream_tables } = data;
  return <>{getTitle(selected_table, unpublished_upstream_tables)}</>;
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
  const { sendSuccessToast } = useMetadataToasts();
  const dispatch = useDispatch();

  if (isLoading || error != null || data == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const { selected_table, unpublished_upstream_tables } = data;

  const handleSubmit = async () => {
    const { target_collection: collection } = await publishTables({
      database_ids: databaseIds,
      schema_ids: schemaIds,
      table_ids: tableIds,
    }).unwrap();

    if (collection != null) {
      sendSuccessToast(
        t`Published`,
        () => dispatch(push(Urls.dataStudioLibrary())),
        t`Go to ${collection.name}`,
      );
    } else {
      sendSuccessToast(t`Published`);
    }

    trackDataStudioTablePublished();

    onPublish();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="sm">
          <Text>{t`Publishing a table saves it to the Library.`}</Text>
          {unpublished_upstream_tables.length > 0 && (
            <>
              <Text>{getForeignKeyMessage(selected_table)}</Text>
              <List spacing="sm">
                {unpublished_upstream_tables.map((table) => (
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
              unpublished_upstream_tables,
            )}
            variant="filled"
          />
        </Group>
      </Form>
    </FormProvider>
  );
}

function getTitle(
  selectedTable: BulkTableInfo | null,
  unpublishedRemappedTables: BulkTableInfo[],
) {
  if (selectedTable != null) {
    return unpublishedRemappedTables.length > 0
      ? t`Publish ${selectedTable.display_name} and the tables it depends on?`
      : t`Publish ${selectedTable.display_name}?`;
  }

  return unpublishedRemappedTables.length > 0
    ? t`Publish these tables and the tables they depend on?`
    : t`Publish these tables?`;
}

function getForeignKeyMessage(selectedTable: BulkTableInfo | null) {
  return selectedTable != null
    ? jt`Because ${(
        <strong key="table">{selectedTable.display_name}</strong>
      )} uses foreign keys to display values from other tables, you'll need to publish these, too:`
    : t`Because some of the tables you've selected use foreign keys to display values from other tables, you'll need to publish the tables below, too:`;
}

function getSubmitButtonLabel(
  selectedTable: BulkTableInfo | null,
  unpublishedRemappedTables: BulkTableInfo[],
) {
  return selectedTable != null && unpublishedRemappedTables.length === 0
    ? t`Publish this table`
    : t`Publish these tables`;
}
