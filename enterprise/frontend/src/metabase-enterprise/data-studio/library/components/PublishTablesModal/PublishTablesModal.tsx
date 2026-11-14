import { useCallback, useEffect, useRef } from "react";
import { jt, t } from "ttag";

import { skipToken, useGetTableSelectionInfoQuery } from "metabase/api";
import FormCollectionPicker from "metabase/common/collections/containers/FormCollectionPicker";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { trackDataStudioTablePublished } from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { PLUGIN_LIBRARY, type PublishTablesModalProps } from "metabase/plugins";
import { useNavigate } from "metabase/router";
import { Button, FocusTrap, List, Modal, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { usePublishTablesMutation } from "metabase-enterprise/api";
import { useHasDataSubfolders } from "metabase-enterprise/data-studio/library/hooks/use-has-data-subfolders";
import type {
  BulkTableInfo,
  BulkTableRequest,
  CollectionId,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

/**
 * Publishes the selected tables. When the Data folder has no subfolders and
 * nothing else has to be published with them, they go straight into the Data
 * folder without a dialog; otherwise the dialog lists what else gets
 * published and, when there are subfolders, asks where to publish.
 */
export function PublishTablesModal({
  databaseIds,
  schemaIds,
  tableIds,
  isOpened,
  onPublish,
  onClose,
}: PublishTablesModalProps) {
  const selection = {
    database_ids: databaseIds,
    schema_ids: schemaIds,
    table_ids: tableIds,
  };
  const { data: selectionInfo, error: selectionError } =
    useGetTableSelectionInfoQuery(isOpened ? selection : skipToken);
  const {
    dataCollection,
    hasSubfolders,
    error: subfoldersError,
  } = useHasDataSubfolders({ skip: !isOpened });
  const publishToCollection = usePublishToCollection(selection);
  const directPublishStartedRef = useRef(false);

  const isDeciding =
    selectionInfo == null || dataCollection == null || hasSubfolders == null;
  const hasLoadError = selectionError != null || subfoldersError != null;
  const isDirectPublish =
    !isDeciding &&
    !hasSubfolders &&
    selectionInfo.unpublished_upstream_tables.length === 0;
  const { sendErrorToast } = useMetadataToasts();

  useEffect(() => {
    if (!isOpened) {
      directPublishStartedRef.current = false;
      return;
    }
    if (!isDirectPublish || dataCollection == null) {
      return;
    }
    if (directPublishStartedRef.current) {
      return;
    }
    directPublishStartedRef.current = true;
    publishToCollection(dataCollection.id).then(onPublish, () => {
      sendErrorToast(t`Failed to publish`);
      onClose();
    });
  }, [
    isOpened,
    isDirectPublish,
    dataCollection,
    publishToCollection,
    sendErrorToast,
    onPublish,
    onClose,
  ]);

  // While deciding, and while publishing straight away, there's no dialog
  if (isDirectPublish || (isDeciding && !hasLoadError)) {
    return null;
  }

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
        showCollectionPicker={hasSubfolders === true}
        onPublish={onPublish}
        onClose={onClose}
      />
    </Modal>
  );
}

/**
 * Publishes the selection into a collection, with the success toast and
 * tracking. Rejects when publishing fails, so the dialog's form can show it.
 */
function usePublishToCollection(selection: BulkTableRequest) {
  const [publishTables] = usePublishTablesMutation();
  const { sendSuccessToast } = useMetadataToasts();
  const navigate = useNavigate();
  const { database_ids, schema_ids, table_ids } = selection;

  return useCallback(
    async (collectionId: CollectionId | undefined) => {
      const { target_collection: collection } = await publishTables({
        database_ids,
        schema_ids,
        table_ids,
        collection_id: collectionId,
      }).unwrap();

      if (collection != null) {
        sendSuccessToast(
          t`Published`,
          () => navigate(Urls.dataStudioPublishedData()),
          t`Go to ${collection.name}`,
        );
      } else {
        sendSuccessToast(t`Published`);
      }
      trackDataStudioTablePublished();
    },
    [
      publishTables,
      database_ids,
      schema_ids,
      table_ids,
      sendSuccessToast,
      navigate,
    ],
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
  /** Without subfolders, the Data folder is the only place to publish to */
  showCollectionPicker: boolean;
  onPublish: () => void;
  onClose: () => void;
};

function ModalBody({
  databaseIds,
  schemaIds,
  tableIds,
  showCollectionPicker,
  onPublish,
  onClose,
}: ModalBodyProps) {
  const selection = {
    database_ids: databaseIds,
    schema_ids: schemaIds,
    table_ids: tableIds,
  };
  const { data, isLoading, error } = useGetTableSelectionInfoQuery(selection);
  const publishToCollection = usePublishToCollection(selection);
  const { data: dataCollection, isLoading: isLoadingDataCollection } =
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType({
      type: "library-data",
    });

  if (isLoading || error != null || data == null || dataCollection == null) {
    return (
      <DelayedLoadingAndErrorWrapper
        loading={isLoading || isLoadingDataCollection || dataCollection == null}
        error={error}
      />
    );
  }

  const { selected_table, unpublished_upstream_tables } = data;

  const handleSubmit = async ({ collection_id }: BulkTableRequest) => {
    await publishToCollection(collection_id);
    onPublish();
  };

  return (
    <FormProvider<BulkTableRequest>
      enableReinitialize
      initialValues={{ collection_id: dataCollection.id }}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="sm">
          <Text>{t`Publishing a table saves it to the semantic layer.`}</Text>
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
          {showCollectionPicker && (
            <FormCollectionPicker
              mt="lg"
              name="collection_id"
              title={t`Publish to`}
              entityType="table"
              collectionPickerModalProps={{
                options: {
                  hasLibrary: true,
                  hasRootCollection: false,
                  hasPersonalCollections: false,
                  hasSearch: true,
                  hasRecents: false,
                  hasConfirmButtons: true,
                  canCreateCollections: true,
                },
              }}
            />
          )}
        </Stack>
        <Modal.Footer>
          <FormErrorMessage flex={1} />
          <Button
            variant="subtle"
            color="neutral"
            onClick={onClose}
          >{t`Cancel`}</Button>
          <FormSubmitButton
            label={getSubmitButtonLabel(
              selected_table,
              unpublished_upstream_tables,
            )}
            variant="filled"
          />
        </Modal.Footer>
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
