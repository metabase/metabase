import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import type { Location } from "history";
import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import {
  useGetTableQueryMetadataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Flex, Stack, rem } from "metabase/ui";

import S from "./DataModel.module.css";
import {
  FieldSection,
  FieldValuesModal,
  NoDatabasesEmptyState,
  PreviewSection,
  type PreviewType,
  RouterTablePicker,
  SegmentsLink,
  SyncOptionsModal,
  TableSection,
} from "./components";
import { EditTableMetadata } from "./components/TableSection/EditTableMetadata";
import { COLUMN_CONFIG, EMPTY_STATE_MIN_WIDTH } from "./constants";
import { SelectionProvider, useSelection } from "./contexts/SelectionContext";
import type { RouteParams } from "./types";
import { getTableMetadataQuery, parseRouteParams } from "./utils";

interface Props {
  children?: ReactNode;
  location: Location;
  params: RouteParams;
}

export const DataModel = ({ children, location, params }: Props) => {
  return (
    <SelectionProvider>
      <DataModelContent location={location} params={params}>
        {children}
      </DataModelContent>
    </SelectionProvider>
  );
};

function DataModelContent({ children, location, params }: Props) {
  const {
    hasSelectedItems,
    hasOnlyOneTableSelected,
    selectedTables,
    hasSelectedMoreThanOneTable,
  } = useSelection();
  const {
    databaseId,
    fieldId,
    schemaName,
    tableId: queryTableId,
  } = parseRouteParams(params);
  const { data: databasesData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery({ include_editable_data_model: true });
  const databaseExists = databasesData?.data?.some(
    (database) => database.id === databaseId,
  );
  const isSegments = location.pathname.startsWith("/data-studio/data/segment");
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
    error,
    isLoading: isLoadingTables,
  } = useGetTableQueryMetadataQuery(getTableMetadataQuery(metadataTableId));
  const fieldsByName = useMemo(() => {
    return _.indexBy(table?.fields ?? [], (field) => field.name);
  }, [table]);
  const field = table?.fields?.find((field) => field.id === fieldId);
  const parentName = field?.nfc_path?.[0] ?? "";
  const parentField = fieldsByName[parentName];
  const [previewType, setPreviewType] = useState<PreviewType>("table");
  const isLoading = isLoadingTables || isLoadingDatabases;

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

  const showBulkTableEdit =
    hasSelectedItems && !hasOnlyOneTableSelected && !showFieldPreview;
  const showFieldDetails = field && !showBulkTableEdit && !isEmptyStateShown;
  const showTableDetailsSection =
    metadataTableId &&
    !hasSelectedMoreThanOneTable &&
    !showFieldPreview &&
    !showFieldDetails;

  return (
    <Flex bg="accent-gray-light" data-testid="data-model" h="100%">
      <Stack
        bg="bg-white"
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
          fieldId={fieldId}
          params={params}
        />

        <Box className={S.footer} mx="xl" py="sm">
          <SegmentsLink active={isSegments} to="/data-studio/data/segments" />
        </Box>
      </Stack>

      {isSegments && children}

      {!isSegments && (
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
              <EditTableMetadata />
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
                    onSyncOptionsClick={openSyncModal}
                  />
                )}
              </LoadingAndErrorWrapper>
            </Stack>
          )}

          {showFieldDetails && (
            <Stack
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
                {field && table && (
                  <Box flex="1" h="100%" maw={COLUMN_CONFIG.field.max}>
                    <FieldSection
                      databaseId={databaseId}
                      field={field}
                      /**
                       * Make sure internal component state is reset when changing fields.
                       * This is to avoid state mix-up with optimistic updates.
                       */
                      key={getRawTableFieldId(field)}
                      parent={parentField}
                      table={table}
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

          {showFieldPreview && (
            <Box
              bg="accent-gray-light"
              flex={COLUMN_CONFIG.preview.flex}
              h="100%"
              p="xl"
              maw={COLUMN_CONFIG.preview.max}
              miw={COLUMN_CONFIG.preview.min}
            >
              <PreviewSection
                className={S.preview}
                databaseId={databaseId}
                field={field}
                fieldId={fieldId}
                previewType={previewType}
                table={table}
                tableId={metadataTableId}
                onClose={closePreview}
                onPreviewTypeChange={setPreviewType}
              />
            </Box>
          )}

          {isEmptyStateShown && (
            <Flex
              align="center"
              flex="4 1 0"
              justify="center"
              miw={rem(EMPTY_STATE_MIN_WIDTH)}
            >
              <Box p="xl">
                <EmptyState
                  illustrationElement={<img src={EmptyDashboardBot} />}
                  title={
                    table
                      ? t`Edit the table and fields`
                      : t`Start by selecting data to model`
                  }
                  message={
                    table
                      ? t`Select a field to edit its name, description, formatting, and more.`
                      : t`Browse your databases to find the table you’d like to edit.`
                  }
                />
              </Box>
            </Flex>
          )}
        </>
      )}

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
