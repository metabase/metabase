import { useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, memo, useCallback, useState } from "react";
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
import type { RouteParams } from "./types";
import { getTableMetadataQuery, parseRouteParams } from "./utils";

// memoize components for smooth column resizing experience
const MemoizedFieldSection = memo(FieldSection);
const MemoizedPreviewSection = memo(PreviewSection);
const MemoizedTableSection = memo(TableSection);

type Column = "nav" | "table" | "field" | "preview";

interface ColumnSizeConfig {
  initial: number;
  min: number;
  max: number;
}

const columnConfig: Record<Column, ColumnSizeConfig> = {
  nav: { initial: 320, min: 240, max: 440 },
  table: { initial: 320, min: 240, max: 640 },
  field: { initial: 480, min: 280, max: 640 },
  preview: { initial: Number.NEGATIVE_INFINITY, min: 400, max: 640 },
};

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
  const [navWidth, setNavWidth] = useState(columnConfig.nav.initial);
  const [tableWidth, setTableWidth] = useState(columnConfig.table.initial);
  const [fieldWidth, setFieldWidth] = useState(columnConfig.field.initial);
  const [previewWidth, setPreviewWidth] = useState(
    columnConfig.preview.initial,
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
  const fieldPreviewConfig: ColumnSizeConfig = {
    initial: fieldWidth + (isPreviewOpen ? previewWidth : 0),
    max:
      columnConfig.field.max + (isPreviewOpen ? columnConfig.preview.max : 0),
    min:
      columnConfig.field.min + (isPreviewOpen ? columnConfig.preview.min : 0),
  };

  const handleResizeStart = useCallback(() => setIsResizing(true), []);
  const handleResizeStop = useCallback(() => setIsResizing(false), []);

  const handlePreviewClick = () => {
    setIsPreviewOpen(true);

    if (Number.isFinite(previewWidth)) {
      setFieldWidth(fieldWidth + previewWidth);
    } else {
      setFieldWidth(fieldWidth + fieldWidth);
      setPreviewWidth(fieldWidth);
    }
  };

  const handlePreviewClose = () => {
    setIsPreviewOpen(false);
    setFieldWidth(fieldWidth - previewWidth);
  };

  return (
    <Flex className={cx({ [S.resizing]: isResizing })} h="100%" ref={ref}>
      <ResizableColumn
        height={height}
        constraints={columnConfig.nav}
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
              constraints={columnConfig.table}
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
              constraints={fieldPreviewConfig}
              width={fieldWidth}
              onResize={(_event, data) => setFieldWidth(data.size.width)}
              onResizeStart={handleResizeStart}
              onResizeStop={handleResizeStop}
            >
              <Box bg="bg-white" className={S.column} h="100%" w={fieldWidth}>
                <LoadingAndErrorWrapper error={error} loading={isLoading}>
                  <Flex justify="space-between" w="100%">
                    {field && (
                      <Box flex="1" h="100%" maw={columnConfig.field.max}>
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
                        handlePosition="left"
                        height={height}
                        constraints={columnConfig.preview}
                        width={previewWidth}
                        onResize={(_event, data) =>
                          setPreviewWidth(data.size.width)
                        }
                        onResizeStart={handleResizeStart}
                        onResizeStop={handleResizeStop}
                      >
                        <Box flex={`1 1 50%}`} miw={0} p="xl">
                          <MemoizedPreviewSection
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
