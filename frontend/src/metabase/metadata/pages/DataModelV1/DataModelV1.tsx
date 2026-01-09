import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import type { Location } from "history";
import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useGetTableQueryMetadataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Flex, Stack, rem } from "metabase/ui";

import {
  FieldEmptyState,
  FieldSection,
  FieldValuesModal,
  NoDatabasesEmptyState,
  PreviewSection,
  type PreviewType,
  SyncOptionsModal,
  TableSection,
} from "../../components";
import { trackMetadataChange } from "../shared";

import S from "./DataModel.module.css";
import { RouterTablePicker, SegmentsLink } from "./components";
import { COLUMN_CONFIG, EMPTY_STATE_MIN_WIDTH } from "./constants";
import type { RouteParams } from "./types";
import { getTableMetadataQuery, parseRouteParams } from "./utils";

interface Props {
  children?: ReactNode;
  location: Location;
  params: RouteParams;
}

export const DataModelV1 = ({ children, location, params }: Props) => {
  const parsedParams = parseRouteParams(params);
  const { databaseId, fieldId, schemaName, tableId } = parsedParams;
  const { data: databasesData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery({ include_editable_data_model: true });
  const databaseExists = databasesData?.data?.some(
    (database) => database.id === databaseId,
  );
  const isSegments = location.pathname.startsWith("/admin/datamodel/segment");
  const [isPreviewOpen, { close: closePreview, toggle: togglePreview }] =
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
    isLoading: isLoadingTables,
  } = useGetTableQueryMetadataQuery(getTableMetadataQuery(tableId));
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

  return (
    <Flex bg="background-secondary" data-testid="data-model" h="100%">
      <Stack
        bg="background-primary"
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
          {databaseId != null &&
            tableId == null &&
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
                {table && (
                  <TableSection
                    /**
                     * Make sure internal component state is reset when changing tables.
                     * This is to avoid state mix-up with optimistic updates.
                     */
                    key={table.id}
                    table={table}
                    fieldId={fieldId}
                    withName
                    getFieldHref={(fieldId) =>
                      Urls.dataModel({ ...parsedParams, fieldId })
                    }
                    onSyncOptionsClick={openSyncModal}
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
                {field && table && (
                  <Box flex="1" h="100%" maw={COLUMN_CONFIG.field.max}>
                    <FieldSection
                      /**
                       * Make sure internal component state is reset when changing fields.
                       * This is to avoid state mix-up with optimistic updates.
                       */
                      key={getRawTableFieldId(field)}
                      field={field}
                      table={table}
                      parent={parentField}
                      getFieldHref={(fieldId) =>
                        Urls.dataModel({ ...parsedParams, fieldId })
                      }
                      onPreviewClick={togglePreview}
                      onFieldValuesClick={openFieldValuesModal}
                      onTrackMetadataChange={trackMetadataChange}
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

          {isEmptyStateShown && (
            <Flex
              align="center"
              flex="1"
              justify="center"
              miw={rem(EMPTY_STATE_MIN_WIDTH)}
            >
              <FieldEmptyState hasTable={table != null} />
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
