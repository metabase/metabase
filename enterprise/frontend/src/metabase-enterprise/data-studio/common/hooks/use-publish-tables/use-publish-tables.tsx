import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useLazyGetTableSelectionInfoQuery,
  usePublishTablesMutation,
} from "metabase-enterprise/api";
import type {
  Collection,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

import { CreateLibraryModal } from "../../components/CreateLibraryModal";
import { PublishTablesModal } from "../../components/PublishTablesModal";

export type PublishTablesSelection = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
};

type UsePublishTablesProps = {
  hasLibrary: boolean;
};

export function usePublishTables({ hasLibrary }: UsePublishTablesProps) {
  const [selection, setSelection] = useState<PublishTablesSelection>();
  const [fetchTables, { isFetching: isFetchingTables }] =
    useLazyGetTableSelectionInfoQuery();
  const [publishTables, { isLoading: isPublishingTables }] =
    usePublishTablesMutation();
  const [
    isLibraryModalOpened,
    { open: openLibraryModal, close: closeLibraryModal },
  ] = useDisclosure();
  const [
    isPublishModalOpened,
    { open: openPublishModal, close: closePublishModal },
  ] = useDisclosure();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleLibraryCreated = () => {
    sendSuccessToast(t`Library created`);
    closeLibraryModal();
    openPublishModal();
  };

  const handlePublishSuccess = (collection: Collection) => {
    closePublishModal();
    sendSuccessToast(
      t`Published`,
      () => dispatch(push(Urls.dataStudioCollection(collection.id))),
      t`Go to ${collection.name}`,
    );
  };

  const handlePublish = async (selection: PublishTablesSelection) => {
    const request = {
      database_ids: selection.databaseIds,
      schema_ids: selection.schemaIds,
      table_ids: selection.tableIds,
    };
    setSelection(selection);

    if (!hasLibrary) {
      openLibraryModal();
      return;
    }

    const { data: tableData } = await fetchTables(request);
    if (tableData == null || tableData.unpublished_upstream_tables.length > 0) {
      openPublishModal();
      return;
    }

    const { data: publishData } = await publishTables(request);
    if (publishData != null) {
      handlePublishSuccess(publishData.target_collection);
    } else {
      sendErrorToast(t`Failed to publish`);
    }
  };

  const publishModal = (
    <>
      <CreateLibraryModal
        title={t`First, let's create your Library`}
        explanatorySentence={t`This is where published tables will go.`}
        isOpened={isLibraryModalOpened}
        onCreate={handleLibraryCreated}
        onClose={closeLibraryModal}
      />
      <PublishTablesModal
        databaseIds={selection?.databaseIds}
        schemaIds={selection?.schemaIds}
        tableIds={selection?.tableIds}
        isOpened={isPublishModalOpened}
        onPublish={handlePublishSuccess}
        onClose={closePublishModal}
      />
    </>
  );

  return {
    publishModal,
    isPublishing: isFetchingTables || isPublishingTables,
    handlePublish,
  };
}
