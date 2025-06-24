import { useWindowEvent } from "@mantine/hooks";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { useGetTableQueryMetadataQuery } from "metabase/api";
import EmptyState from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Flex, Stack, rem } from "metabase/ui";

import S from "./DataModel.module.css";
import {
  FieldSection,
  PreviewSection,
  type PreviewType,
  RouterTablePicker,
  SegmentsLink,
  TableSection,
} from "./components";
import { COLUMN_CONFIG, EMPTY_STATE_MIN_WIDTH } from "./constants";
import type { RouteParams } from "./types";
import { getTableMetadataQuery, parseRouteParams } from "./utils";

interface Props {
  children: ReactNode;
  location: Location;
  params: RouteParams;
}

export const DataModel = ({ children, location, params }: Props) => {
  const { databaseId, fieldId, schemaName, tableId } = parseRouteParams(params);
  const isSegments = location.pathname.startsWith("/admin/datamodel/segment");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const isEmptyStateShown =
    databaseId == null || tableId == null || fieldId == null;
  const {
    data: table,
    error,
    isLoading,
  } = useGetTableQueryMetadataQuery(getTableMetadataQuery(tableId));
  const field = table?.fields?.find((field) => field.id === fieldId);
  const [previewType, setPreviewType] = useState<PreviewType>("table");

  const handlePreviewClick = () => {
    setIsPreviewOpen(true);
  };

  useWindowEvent("keydown", (event) => {
    const activeElement = document.activeElement;
    const isInputFocused =
      activeElement instanceof HTMLElement &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) ||
        activeElement.isContentEditable);

    if (event.key === "Escape" && isPreviewOpen && !isInputFocused) {
      event.stopPropagation();
      setIsPreviewOpen(false);
    }
  });

  return (
    <Flex h="100%">
      <Stack
        flex={COLUMN_CONFIG.nav.flex}
        style={
          {
            /* overflow: "hidden", */
            /* flexBasis: 'auto' */
          }
        }
        h="100%"
        miw={COLUMN_CONFIG.nav.min}
        maw={COLUMN_CONFIG.nav.max}
      >
        <Stack
          bg="accent-gray-light"
          className={S.column}
          gap={0}
          h="100%"
          w="100%"
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
      </Stack>

      {isSegments && children}

      {!isSegments && (
        <>
          {tableId && (
            <Stack
              flex={COLUMN_CONFIG.table.flex}
              style={
                {
                  /* overflow: "hidden", */
                  /* flexBasis: 'auto' */
                }
              }
              h="100%"
              miw={COLUMN_CONFIG.table.min}
              maw={COLUMN_CONFIG.table.max}
            >
              <Box bg="bg-white" className={S.column} h="100%" w="100%">
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
                    />
                  )}
                </LoadingAndErrorWrapper>
              </Box>
            </Stack>
          )}

          {!isEmptyStateShown && (
            <Stack
              flex={COLUMN_CONFIG.field.flex}
              style={
                {
                  /* overflow: "hidden", */
                  /* flexBasis: 'auto' */
                }
              }
              h="100%"
              miw={COLUMN_CONFIG.field.min}
              maw={COLUMN_CONFIG.field.max}
            >
              <Box bg="bg-white" className={S.column} h="100%" w="100%">
                <LoadingAndErrorWrapper error={error} loading={isLoading}>
                  <Flex justify="space-between" w="100%">
                    {field && (
                      <Box flex="1" h="100%" maw={COLUMN_CONFIG.field.max}>
                        <FieldSection
                          databaseId={databaseId}
                          field={field}
                          isPreviewOpen={isPreviewOpen}
                          /**
                           * Make sure internal component state is reset when changing fields.
                           * This is to avoid state mix-up with optimistic updates.
                           */
                          key={getRawTableFieldId(field)}
                          onPreviewClick={handlePreviewClick}
                        />
                      </Box>
                    )}
                  </Flex>
                </LoadingAndErrorWrapper>
              </Box>
            </Stack>
          )}

          {!isEmptyStateShown && field && table && isPreviewOpen && (
            <Box
              flex={COLUMN_CONFIG.preview.flex}
              style={
                {
                  /* overflow: "hidden", */
                  /* flexBasis: 'auto' */
                }
              }
              h="100%"
              miw={COLUMN_CONFIG.preview.min}
              maw={COLUMN_CONFIG.preview.max}
              p="xl"
            >
              <Box h="100%" w="100%">
                <PreviewSection
                  className={S.preview}
                  databaseId={databaseId}
                  field={field}
                  fieldId={fieldId}
                  previewType={previewType}
                  table={table}
                  tableId={tableId}
                  onClose={() => setIsPreviewOpen(false)}
                  onPreviewTypeChange={setPreviewType}
                />
              </Box>
            </Box>
          )}

          {isEmptyStateShown && (
            <Flex
              align="center"
              bg="bg-white"
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
    </Flex>
  );
};
