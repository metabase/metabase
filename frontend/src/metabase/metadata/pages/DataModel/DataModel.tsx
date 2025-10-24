import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import {
  useGetCardQuery,
  useGetTableQueryMetadataQuery,
  useListDatabasesQuery,
  useUpdateCardMutation,
  useUpdateFieldMutation,
} from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ModelColumnsSection } from "metabase/metadata/pages/DataModel/components/models/ModelColumnsList";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Flex, Stack, Title, rem } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { FieldName, UpdateFieldRequest } from "metabase-types/api";

import S from "./DataModel.module.css";
import {
  FieldSection,
  FieldValuesModal,
  NoDatabasesEmptyState,
  PreviewSection,
  type PreviewType,
  RouterTablePicker,
  SyncOptionsModal,
  TableSection,
} from "./components";
import { COLUMN_CONFIG, EMPTY_STATE_MIN_WIDTH } from "./constants";
import type { FieldChangeParams, RouteParams } from "./types";
import { getTableMetadataQuery, parseRouteParams } from "./utils";

interface Props {
  params: RouteParams;
}

export const DataModel = ({ params }: Props) => {
  const {
    databaseId,
    fieldId,
    schemaName,
    tableId,
    collectionId,
    modelId,
    fieldName,
  } = parseRouteParams(params);
  const { data: databasesData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery({ include_editable_data_model: true });
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
  const isModelMode = modelId != null;
  const isEmptyStateShown = isModelMode
    ? collectionId == null || fieldName == null
    : databaseId == null || tableId == null || fieldId == null;
  const {
    currentData: table,
    error,
    isLoading: isLoadingTables,
  } = useGetTableQueryMetadataQuery(
    isModelMode
      ? getTableMetadataQuery(getQuestionVirtualTableId(modelId))
      : getTableMetadataQuery(tableId),
  );

  const { isLoading: isLoadingModel, data: modelCard } = useGetCardQuery(
    { id: modelId as number },
    { skip: !modelId },
  );

  const [updateField] = useUpdateFieldMutation();
  const [updateCard] = useUpdateCardMutation();
  const fieldsByName = useMemo(() => {
    return _.indexBy(table?.fields ?? [], (field) => field.name);
  }, [table]);
  const field = table?.fields?.find(
    isModelMode
      ? (field) => field.name === fieldName
      : (field) => field.id === fieldId,
  );
  const parentName = field?.nfc_path?.[0] ?? "";
  const parentField = fieldsByName[parentName];
  const [previewType, setPreviewType] = useState<PreviewType>("table");
  const isLoading = isLoadingTables || isLoadingDatabases || isLoadingModel;
  const fieldDatabaseId = isModelMode ? modelCard?.database_id : databaseId;

  const handleTableFieldChange = useCallback(
    (update: FieldChangeParams) => {
      if (!update.id) {
        throw new Error(`Cannot find field "id" in update object`);
      }

      return updateField(update as UpdateFieldRequest);
    },
    [updateField],
  );

  const handleModelColumnChange = useCallback(
    (update: FieldChangeParams) => {
      if (!modelCard || !modelId) {
        return Promise.reject();
      }

      const newMetadata = table?.fields?.map((column) => {
        return update.name === column.name ? { ...column, ...update } : column;
      });

      return updateCard({
        id: modelId,
        result_metadata: newMetadata,
      });
    },
    [modelCard, modelId, table?.fields, updateCard],
  );

  const handleModelColumnsOrderChange = useCallback(
    (fieldsOrder: FieldName[]) => {
      if (!modelCard || !modelId) {
        return Promise.reject();
      }

      const newFields = fieldsOrder.map((fieldName) => ({
        name: fieldName,
        enabled: true,
      }));

      return updateCard({
        id: modelId,
        visualization_settings: {
          ...modelCard.visualization_settings,
          "table.columns": newFields,
        },
      });
    },
    [modelCard, modelId, updateCard],
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
      // otherwise modals get closed ealier and isModalOpen evaluates to false in the handler
      capture: true,
    },
  );

  if (databasesData?.data?.length === 0) {
    return <NoDatabasesEmptyState />;
  }

  return (
    <Flex bg="accent-gray-light" data-testid="data-model" h="100%">
      <Stack
        bg="bg-white"
        className={S.column}
        flex={COLUMN_CONFIG.nav.flex}
        gap={0}
        mih="100%"
        maw={COLUMN_CONFIG.nav.max}
        miw={COLUMN_CONFIG.nav.min}
      >
        <Title py="lg" px="xl" order={3}>{t`Metadata`}</Title>
        <RouterTablePicker
          className={S.tablePicker}
          databaseId={databaseId}
          schemaName={schemaName}
          tableId={tableId}
          modelId={modelId}
          params={params}
        />
      </Stack>

      {databaseId != null && tableId == null && databaseExists === false && (
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

      {tableId && (
        <Stack
          className={S.column}
          flex={COLUMN_CONFIG.table.flex}
          h="100%"
          justify={error ? "center" : undefined}
          maw={COLUMN_CONFIG.table.max}
          miw={COLUMN_CONFIG.table.min}
        >
          <LoadingAndErrorWrapper error={error} loading={isLoading}>
            {table && !isModelMode && (
              <TableSection
                /**
                 * Make sure internal component state is reset when changing tables.
                 * This is to avoid state mix-up with optimistic updates.
                 */
                key={table.id}
                params={params}
                table={table}
                onSyncOptionsClick={openSyncModal}
              />
            )}
          </LoadingAndErrorWrapper>
        </Stack>
      )}

      {isModelMode && modelId && collectionId && (
        <Stack
          className={S.column}
          flex={COLUMN_CONFIG.table.flex}
          h="100%"
          justify={error ? "center" : undefined}
          maw={COLUMN_CONFIG.table.max}
          miw={COLUMN_CONFIG.table.min}
        >
          <LoadingAndErrorWrapper error={error} loading={isLoading}>
            {table && modelCard && (
              <ModelColumnsSection
                /**
                 * Make sure internal component state is reset when changing tables.
                 * This is to avoid state mix-up with optimistic updates.
                 */
                key={table.id}
                collectionId={collectionId}
                modelId={modelId}
                fieldName={fieldName}
                model={modelCard}
                onFieldChange={handleModelColumnChange}
                onFieldsOrderChange={handleModelColumnsOrderChange}
              />
            )}
          </LoadingAndErrorWrapper>
        </Stack>
      )}

      {!isEmptyStateShown && (
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
            {field && table && fieldDatabaseId && (
              <Box flex="1" h="100%" maw={COLUMN_CONFIG.field.max}>
                <FieldSection
                  mode={isModelMode ? "model" : "table"}
                  databaseId={fieldDatabaseId}
                  field={field}
                  /**
                   * Make sure internal component state is reset when changing fields.
                   * This is to avoid state mix-up with optimistic updates.
                   */
                  key={isModelMode ? fieldName : getRawTableFieldId(field)}
                  parent={parentField}
                  table={table}
                  collectionId={collectionId}
                  onFieldValuesClick={openFieldValuesModal}
                  onPreviewClick={togglePreview}
                  onFieldChange={
                    isModelMode
                      ? handleModelColumnChange
                      : handleTableFieldChange
                  }
                />
              </Box>
            )}
          </LoadingAndErrorWrapper>

          {!isLoading && !error && !field && (
            <LoadingAndErrorWrapper error={t`Not found.`} />
          )}
        </Stack>
      )}

      {!isEmptyStateShown && field && table && isPreviewOpen && (
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
            databaseId={table.db_id}
            field={field}
            fieldId={getRawTableFieldId(field)}
            previewType={previewType}
            table={table}
            tableId={table.id}
            onClose={closePreview}
            onPreviewTypeChange={setPreviewType}
          />
        </Box>
      )}

      {isEmptyStateShown && (
        <Flex
          align="center"
          flex="1"
          justify="center"
          miw={rem(EMPTY_STATE_MIN_WIDTH)}
        >
          <Box maw={rem(320)} p="xl">
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

      {table && (
        <SyncOptionsModal
          isOpen={isSyncModalOpen}
          tableId={table.id}
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
};
