import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useGetTableQueryMetadataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import {
  FieldSection,
  FieldValuesModal,
  NoDatabasesEmptyState,
  PreviewSection,
  type PreviewType,
} from "metabase/metadata/components";
import { getTableMetadataQuery } from "metabase/metadata/pages/shared/utils";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Flex, Stack, rem } from "metabase/ui";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import { hasLibraryCollection } from "metabase-enterprise/data-studio/common/utils";

import { trackMetadataChange } from "../../analytics";
import {
  RouterTablePicker,
  SyncOptionsModal,
  TableSection,
} from "../../components";
import { TableAttributesEditBulk } from "../../components/TableSection/TableAttributesEditBulk";

import S from "./DataModel.module.css";
import { COLUMN_CONFIG } from "./constants";
import { SelectionProvider, useSelection } from "./contexts/SelectionContext";
import type { RouteParams } from "./types";
import { parseRouteParams } from "./utils";

interface Props {
  children?: ReactNode;
  params: RouteParams;
}

export const DataModel = ({ children, params }: Props) => {
  return (
    <SelectionProvider>
      <DataModelContent params={params}>{children}</DataModelContent>
    </SelectionProvider>
  );
};

function DataModelContent({ params }: Props) {
  const {
    hasSelectedItems,
    hasOnlyOneTableSelected,
    selectedTables,
    hasSelectedMoreThanOneTable,
  } = useSelection();
  const parsedParams = parseRouteParams(params);
  const {
    databaseId,
    fieldId,
    schemaName,
    tab: activeTab,
    tableId: queryTableId,
  } = parsedParams;
  const {
    data: databasesData,
    error: databasesError,
    isLoading: isLoadingDatabases,
  } = useListDatabasesQuery({ include_editable_data_model: true });
  const databaseExists = databasesData?.data?.some(
    (database) => database.id === databaseId,
  );
  const [isPreviewOpen, { close: closePreview, toggle: togglePreview }] =
    useDisclosure();
  const [isSyncModalOpen, { close: closeSyncModal, open: openSyncModal }] =
    useDisclosure();
  const [
    isFieldValuesModalOpen,
    { close: closeFieldValuesModal, open: openFieldValuesModal },
  ] = useDisclosure();
  // Use the first selected table for fetching metadata when exactly one is selected
  const metadataTableId = Array.from(selectedTables)[0] ?? queryTableId;
  // But keep the URL tableId for navigation/path to avoid auto-expansion when selecting/deselecting
  const navigationTableId = hasSelectedItems ? queryTableId : queryTableId;

  const {
    data: table,
    error: tableError,
    isLoading: isLoadingTables,
  } = useGetTableQueryMetadataQuery(getTableMetadataQuery(metadataTableId));
  const fieldsByName = useMemo(() => {
    return _.indexBy(table?.fields ?? [], (field) => field.name);
  }, [table]);
  const field = table?.fields?.find((field) => field.id === fieldId);
  const parentName = field?.nfc_path?.[0] ?? "";
  const parentField = fieldsByName[parentName];

  const {
    data: libraryCollection,
    isLoading: isLoadingLibrary,
    error: libraryError,
  } = useGetLibraryCollectionQuery();

  const [previewType, setPreviewType] = useState<PreviewType>("table");
  const isLoading = isLoadingDatabases || isLoadingTables || isLoadingLibrary;
  const error = databasesError ?? tableError ?? libraryError;

  const hasLibrary = hasLibraryCollection(libraryCollection);

  const [onUpdateCallback, setOnUpdateCallback] = useState<(() => void) | null>(
    null,
  );

  useWindowEvent(
    "keydown",
    (event) => {
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) ||
          activeElement.isContentEditable);
      const isModalOpen = isSyncModalOpen || isFieldValuesModalOpen;

      if (event.key === "Escape" && !isInputFocused && !isModalOpen) {
        event.stopPropagation();
        closePreview();
      }
    },
    {
      // otherwise modals get closed earlier and isModalOpen evaluates to false in the handler
      capture: true,
    },
  );

  if (databasesData?.data?.length === 0) {
    return <NoDatabasesEmptyState />;
  }

  const isEmptyStateShown =
    metadataTableId == null && fieldId == null && !hasSelectedItems;
  const showFieldPreview =
    !isEmptyStateShown && field && table && isPreviewOpen;

  const showBulkTableEdit = hasSelectedItems && !hasOnlyOneTableSelected;
  const showFieldDetails =
    fieldId != null && !showBulkTableEdit && !isEmptyStateShown;
  const showTableDetailsSection =
    metadataTableId != null &&
    !hasSelectedMoreThanOneTable &&
    !showBulkTableEdit;

  return (
    <Flex
      bg="background-secondary"
      data-testid="data-model"
      h="100%"
      style={{ overflow: "auto" }}
    >
      <Stack
        className={S.column}
        flex={COLUMN_CONFIG.nav.flex}
        gap={0}
        h="100%"
        maw={COLUMN_CONFIG.nav.max}
        miw={COLUMN_CONFIG.nav.min}
      >
        <RouterTablePicker
          databaseId={databaseId}
          schemaName={schemaName}
          tableId={navigationTableId}
          params={params}
          setOnUpdateCallback={setOnUpdateCallback}
        />
      </Stack>

      <>
        {databaseId != null &&
          metadataTableId == null &&
          databaseExists === false && (
            <Stack
              className={S.column}
              h="100%"
              justify="center"
              miw={rem(400)}
              p="xl"
            >
              <LoadingAndErrorWrapper error={t`Not found.`} />
            </Stack>
          )}

        {showBulkTableEdit && (
          <Stack
            className={S.column}
            flex={COLUMN_CONFIG.table.flex}
            h="100%"
            justify={error ? "center" : undefined}
            maw={COLUMN_CONFIG.table.max}
            miw={COLUMN_CONFIG.table.min}
          >
            <TableAttributesEditBulk
              hasLibrary={hasLibrary}
              onUpdate={() => onUpdateCallback?.()}
            />
          </Stack>
        )}

        {showTableDetailsSection && (
          <Stack
            className={S.column}
            flex={COLUMN_CONFIG.table.flex}
            h="100%"
            justify={error ? "center" : undefined}
            maw={COLUMN_CONFIG.table.max}
            miw={COLUMN_CONFIG.table.min}
          >
            <LoadingAndErrorWrapper error={error} loading={isLoading}>
              {table && (
                <TableSection
                  /**
                   * Make sure internal component state is reset when changing tables.
                   * This is to avoid state mix-up with optimistic updates.
                   */
                  key={table.id}
                  table={table}
                  activeFieldId={fieldId}
                  activeTab={activeTab}
                  hasLibrary={hasLibrary}
                  onSyncOptionsClick={openSyncModal}
                />
              )}
            </LoadingAndErrorWrapper>
          </Stack>
        )}

        {showFieldDetails && (
          <Stack
            bg="white"
            className={S.column}
            flex={COLUMN_CONFIG.field.flex}
            h="100%"
            justify={
              (!isLoading && !error && !field) || error ? "center" : undefined
            }
            maw={COLUMN_CONFIG.field.max}
            miw={COLUMN_CONFIG.field.min}
          >
            <LoadingAndErrorWrapper error={error} loading={isLoading}>
              {field && table && databaseId != null && (
                <Box flex="1" h="100%" maw={COLUMN_CONFIG.field.max}>
                  <FieldSection
                    /**
                     * Make sure internal component state is reset when changing fields.
                     * This is to avoid state mix-up with optimistic updates.
                     */
                    key={getRawTableFieldId(field)}
                    field={field}
                    parent={parentField}
                    table={table}
                    getFieldHref={(fieldId) =>
                      Urls.dataStudioData({ ...parsedParams, fieldId })
                    }
                    onTrackMetadataChange={trackMetadataChange}
                    onFieldValuesClick={openFieldValuesModal}
                    onPreviewClick={togglePreview}
                  />
                </Box>
              )}
            </LoadingAndErrorWrapper>

            {!isLoading && !error && !field && (
              <LoadingAndErrorWrapper error={t`Not found.`} />
            )}
          </Stack>
        )}

        {showFieldPreview && databaseId != null && fieldId != null && (
          <Box
            bg="accent-gray-light"
            flex={COLUMN_CONFIG.preview.flex}
            h="100%"
            p="lg"
            maw={COLUMN_CONFIG.preview.max}
            miw={COLUMN_CONFIG.preview.min}
          >
            <PreviewSection
              className={S.preview}
              field={field}
              table={table}
              previewType={previewType}
              onPreviewTypeChange={setPreviewType}
              onClose={closePreview}
            />
          </Box>
        )}
      </>

      {table && (
        <SyncOptionsModal
          isOpen={isSyncModalOpen}
          tableIds={[table.id]}
          onClose={closeSyncModal}
        />
      )}

      {fieldId && (
        <FieldValuesModal
          fieldId={fieldId}
          isOpen={isFieldValuesModalOpen}
          onClose={closeFieldValuesModal}
        />
      )}
    </Flex>
  );
}
