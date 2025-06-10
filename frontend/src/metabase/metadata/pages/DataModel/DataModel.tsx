import { useElementSize, useWindowEvent } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, memo, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { useGetTableQueryMetadataQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Flex, Stack, rem } from "metabase/ui";

import S from "./DataModel.module.css";
import {
  FieldSection,
  PreviewSection,
  type PreviewType,
  ResizableColumn,
  RouterTablePicker,
  SegmentsLink,
  TableSection,
} from "./components";
import { COLUMN_CONFIG } from "./constants";
import type { RouteParams } from "./types";
import {
  getFieldConfig,
  getPreviewConfig,
  getTableMetadataQuery,
  parseRouteParams,
} from "./utils";

// memoize components for smooth column resizing experience
const MemoizedFieldSection = memo(FieldSection);
const MemoizedPreviewSection = memo(PreviewSection);
const MemoizedTableSection = memo(TableSection);

interface Props {
  params: RouteParams;
  location: Location;
  children: ReactNode;
}

export const DataModel = ({ params, location, children }: Props) => {
  const { databaseId, fieldId, tableId, schemaId } = parseRouteParams(params);
  const isSegments = location.pathname.startsWith("/admin/datamodel/segment");
  const [isResizing, setIsResizing] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [navWidth, setNavWidth] = useState(COLUMN_CONFIG.nav.initial);
  const [tableWidth, setTableWidth] = useState(COLUMN_CONFIG.table.initial);
  const [fieldWidth, setFieldWidth] = useState(COLUMN_CONFIG.field.initial);
  const [previewWidth, setPreviewWidth] = useState(
    COLUMN_CONFIG.preview.initial,
  );
  const { height, ref } = useElementSize();
  const isEmptyStateShown =
    databaseId == null || tableId == null || fieldId == null;
  const {
    data: table,
    error,
    isLoading,
  } = useGetTableQueryMetadataQuery(getTableMetadataQuery(tableId));
  const field = table?.fields?.find((field) => field.id === fieldId);
  const [previewType, setPreviewType] = useState<PreviewType>("table");
  const fieldConfig = useMemo(
    () => getFieldConfig({ isPreviewOpen, fieldWidth, previewWidth }),
    [isPreviewOpen, fieldWidth, previewWidth],
  );
  const previewConfig = useMemo(
    () => getPreviewConfig({ isPreviewOpen, fieldWidth, previewWidth }),
    [isPreviewOpen, fieldWidth, previewWidth],
  );

  const handleResizeStart = useCallback(() => setIsResizing(true), []);
  const handleResizeStop = useCallback(() => setIsResizing(false), []);

  const handlePreviewClick = () => {
    setIsPreviewOpen(true);
    setFieldWidth(fieldWidth + previewWidth);
  };

  const handlePreviewClose = () => {
    setIsPreviewOpen(false);
    setFieldWidth(fieldWidth - previewWidth);
  };

  useWindowEvent("keydown", (event) => {
    if (
      event.key === "Escape" &&
      isPreviewOpen &&
      event.target instanceof HTMLElement &&
      event.target.tagName === "BODY"
    ) {
      event.stopPropagation();
      handlePreviewClose();
    }
  });

  return (
    <Flex className={cx({ [S.resizing]: isResizing })} h="100%" ref={ref}>
      <ResizableColumn
        height={height}
        constraints={COLUMN_CONFIG.nav}
        width={navWidth}
        onResize={(_event, data) => setNavWidth(data.size.width)}
        onResizeStart={handleResizeStart}
        onResizeStop={handleResizeStop}
      >
        <Stack
          bg="accent-gray-light"
          className={S.column}
          gap={0}
          h="100%"
          w={navWidth}
        >
          <RouterTablePicker
            databaseId={databaseId}
            schemaId={schemaId}
            tableId={tableId}
          />

          <Box className={S.footer} mx="xl" py="sm">
            <SegmentsLink active={isSegments} to="/admin/datamodel/segments" />
          </Box>
        </Stack>
      </ResizableColumn>

      {isSegments && children}

      {!isSegments && (
        <>
          {tableId && (
            <ResizableColumn
              height={height}
              constraints={COLUMN_CONFIG.table}
              width={tableWidth}
              onResize={(_event, data) => setTableWidth(data.size.width)}
              onResizeStart={handleResizeStart}
              onResizeStop={handleResizeStop}
            >
              <Box bg="bg-white" className={S.column} h="100%" w={tableWidth}>
                <LoadingAndErrorWrapper error={error} loading={isLoading}>
                  {table && (
                    <MemoizedTableSection
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
            </ResizableColumn>
          )}

          {isEmptyStateShown && (
            <Flex
              align="center"
              bg="bg-white"
              flex="1"
              justify="center"
              miw={rem(240)}
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

          {!isEmptyStateShown && (
            <ResizableColumn
              height={height}
              constraints={fieldConfig}
              width={fieldWidth}
              onResize={(_event, data) => setFieldWidth(data.size.width)}
              onResizeStart={handleResizeStart}
              onResizeStop={handleResizeStop}
            >
              <Box bg="bg-white" className={S.column} h="100%" w={fieldWidth}>
                <LoadingAndErrorWrapper error={error} loading={isLoading}>
                  <Flex justify="space-between" w="100%">
                    {field && (
                      <Box flex="1" h="100%" maw={COLUMN_CONFIG.field.max}>
                        <MemoizedFieldSection
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

                    {field && table && isPreviewOpen && (
                      <ResizableColumn
                        className={S.previewColumn}
                        handlePosition="left"
                        height={height}
                        constraints={previewConfig}
                        width={previewWidth}
                        onResize={(_event, data) =>
                          setPreviewWidth(data.size.width)
                        }
                        onResizeStart={handleResizeStart}
                        onResizeStop={handleResizeStop}
                      >
                        <Box h="100%" p="xl" pl={0}>
                          <MemoizedPreviewSection
                            className={S.preview}
                            databaseId={databaseId}
                            field={field}
                            fieldId={fieldId}
                            previewType={previewType}
                            table={table}
                            tableId={tableId}
                            onClose={handlePreviewClose}
                            onPreviewTypeChange={setPreviewType}
                          />
                        </Box>
                      </ResizableColumn>
                    )}
                  </Flex>
                </LoadingAndErrorWrapper>
              </Box>
            </ResizableColumn>
          )}
        </>
      )}
    </Flex>
  );
};
