import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import type { Location } from "history";
import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { useGetTableQueryMetadataQuery } from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Flex, Stack, rem } from "metabase/ui";

import S from "./DataModel.module.css";
import {
  FieldSection,
  FieldValuesModal,
  PreviewSection,
  type PreviewType,
  RouterTablePicker,
  SegmentsLink,
  SyncOptionsModal,
  TableSection,
} from "./components";
import { COLUMN_CONFIG, EMPTY_STATE_MIN_WIDTH } from "./constants";
import type { RouteParams } from "./types";
import { getTableMetadataQuery, parseRouteParams } from "./utils";

interface Props {
  children?: ReactNode;
  location: Location;
  params: RouteParams;
}

export const DataModel = ({ children, location, params }: Props) => {
  const { databaseId, fieldId, schemaName, tableId } = parseRouteParams(params);
  const isSegments = location.pathname.startsWith("/admin/datamodel/segment");
  const [isPreviewOpen, { close: closePreview, open: openPreview }] =
    useDisclosure();
  const [isSyncModalOpen, { close: closeSyncModal, open: openSyncModal }] =
    useDisclosure();
  const [
    isFieldValuesModalOpen,
    { close: closeFieldValuesModal, open: openFieldValuesModal },
  ] = useDisclosure();
  const isEmptyStateShown =
    databaseId == null || tableId == null || fieldId == null;
  const {
    data: table,
    error,
    isLoading,
  } = useGetTableQueryMetadataQuery(getTableMetadataQuery(tableId));
  const fieldsByName = useMemo(() => {
    return _.indexBy(table?.fields ?? [], (field) => field.name);
  }, [table]);
  const field = table?.fields?.find((field) => field.id === fieldId);
  const parentName = field?.nfc_path?.[0] ?? "";
  const parentField = fieldsByName[parentName];
  const [previewType, setPreviewType] = useState<PreviewType>("table");

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

  return (
    <Flex bg="accent-gray-light" h="100%">
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
          tableId={tableId}
        />

        <Box className={S.footer} mx="xl" py="sm">
          <SegmentsLink active={isSegments} to="/admin/datamodel/segments" />
        </Box>
      </Stack>

      {isSegments && children}

      {!isSegments && (
        <>
          {tableId && (
            <Box
              className={S.column}
              flex={COLUMN_CONFIG.table.flex}
              h="100%"
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
                    params={params}
                    table={table}
                    onSyncOptionsClick={openSyncModal}
                  />
                )}
              </LoadingAndErrorWrapper>
            </Box>
          )}

          {!isEmptyStateShown && (
            <Box
              className={S.column}
              flex={COLUMN_CONFIG.field.flex}
              h="100%"
              maw={COLUMN_CONFIG.field.max}
              miw={COLUMN_CONFIG.field.min}
            >
              <LoadingAndErrorWrapper error={error} loading={isLoading}>
                <Flex justify="space-between" w="100%">
                  {field && (
                    <Box flex="1" h="100%" maw={COLUMN_CONFIG.field.max}>
                      <FieldSection
                        databaseId={databaseId}
                        field={field}
                        parent={parentField}
                        isPreviewOpen={isPreviewOpen}
                        /**
                         * Make sure internal component state is reset when changing fields.
                         * This is to avoid state mix-up with optimistic updates.
                         */
                        key={getRawTableFieldId(field)}
                        onFieldValuesClick={openFieldValuesModal}
                        onPreviewClick={openPreview}
                      />
                    </Box>
                  )}
                </Flex>
              </LoadingAndErrorWrapper>
            </Box>
          )}

          {!isEmptyStateShown && field && table && isPreviewOpen && (
            <Box
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
                tableId={tableId}
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
                    tableId
                      ? t`Edit the table and fields`
                      : t`Start by selecting data to model`
                  }
                  message={
                    tableId
                      ? t`Select a field to edit it. Then change the display name, semantic type or filtering behavior.`
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
