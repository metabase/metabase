import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useGetTableQueryMetadataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { hasLibraryCollection } from "metabase/data-studio/common/utils";
import { isCypressActive } from "metabase/env";
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
import { PLUGIN_LIBRARY } from "metabase/plugins";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  ScrollArea,
  Stack,
  rem,
} from "metabase/ui";

import { trackMetadataChange } from "../../analytics";
import {
  RouterTablePicker,
  SyncOptionsModal,
  TableSection,
} from "../../components";
import { TableAttributesEditBulk } from "../../components/TableSection/components/TableAttributesEditBulk";

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
    resetSelection,
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
  } = useListDatabasesQuery();
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

  const hasLibraryFeature = useHasTokenFeature("library");
  const { data: libraryCollection, isLoading: isLoadingLibrary } =
    PLUGIN_LIBRARY.useGetLibraryCollectionQuery(undefined, {
      skip: !hasLibraryFeature,
    });

  const [previewType, setPreviewType] = useState<PreviewType>("table");
  const isLoading = isLoadingDatabases || isLoadingTables || isLoadingLibrary;
  const error = databasesError ?? tableError;

  const hasLibrary = hasLibraryCollection(libraryCollection);
  const canPublish = hasLibraryFeature;

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

  const scrollToPanel = useCallback((el: HTMLDivElement | null) => {
    el?.scrollIntoView({
      behavior: isCypressActive ? "instant" : "smooth",
      inline: "end",
    });
  }, []);

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
      <PageContainer
        maw={COLUMN_CONFIG.nav.max}
        miw={COLUMN_CONFIG.nav.min}
        flex={COLUMN_CONFIG.nav.flex}
        className={S.column}
        gap={0}
      >
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>{t`Data structure`}</DataStudioBreadcrumbs>
          }
        />
        <RouterTablePicker
          databaseId={databaseId}
          schemaName={schemaName}
          tableId={navigationTableId}
          params={params}
          setOnUpdateCallback={setOnUpdateCallback}
        />
      </PageContainer>

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
              canPublish={canPublish}
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
            ref={scrollToPanel}
            gap={0}
          >
            <Group
              justify="space-between"
              w="100%"
              data-testid="table-section-header"
              py="lg"
              bg="background-secondary"
              className={S.header}
              px="lg"
            >
              <DataStudioBreadcrumbs>{t`Table details`}</DataStudioBreadcrumbs>
              <Button
                component={ForwardRefLink}
                to={Urls.dataStudioData({
                  databaseId: table?.db_id,
                  schemaName: table?.schema,
                })}
                leftSection={<Icon name="close" c="text-secondary" />}
                variant="subtle"
                p="sm"
                size="compact-sm"
                onClick={() => {
                  closePreview();
                  resetSelection();
                }}
              />
            </Group>
            <ScrollArea flex={1} px="lg" type="hover">
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
                    canPublish={canPublish}
                    hasLibrary={hasLibrary}
                    onSyncOptionsClick={openSyncModal}
                  />
                )}
              </LoadingAndErrorWrapper>
            </ScrollArea>
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
            ref={scrollToPanel}
            gap={0}
          >
            <Group
              justify="space-between"
              w="100%"
              data-testid="field-section-header"
              p="lg"
              bg="background-secondary"
              className={S.header}
            >
              <DataStudioBreadcrumbs>{t`Field details`}</DataStudioBreadcrumbs>
              <Button
                component={ForwardRefLink}
                to={Urls.dataStudioData({
                  databaseId: table?.db_id,
                  schemaName: table?.schema,
                  tableId: table?.id,
                })}
                leftSection={<Icon name="close" c="text-secondary" />}
                variant="subtle"
                size="compact-sm"
                onClick={closePreview}
              />
            </Group>
            <ScrollArea flex={1} px="lg" type="hover">
              <LoadingAndErrorWrapper error={error} loading={isLoading}>
                {field && table && databaseId != null && (
                  <>
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
                  </>
                )}
              </LoadingAndErrorWrapper>

              {!isLoading && !error && !field && (
                <LoadingAndErrorWrapper error={t`Not found.`} />
              )}
            </ScrollArea>
          </Stack>
        )}

        {showFieldPreview && databaseId != null && fieldId != null && (
          <Box
            flex={COLUMN_CONFIG.preview.flex}
            h="100%"
            p="lg"
            maw={COLUMN_CONFIG.preview.max}
            miw={COLUMN_CONFIG.preview.min}
            ref={scrollToPanel}
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
