import { useElementSize, useWindowEvent } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useCallback, useLayoutEffect, useState } from "react";
import { usePrevious, useWindowSize } from "react-use";
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
  ResizableColumn,
  RouterTablePicker,
  SegmentsLink,
  TableSection,
} from "./components";
import {
  COLUMN_CONFIG,
  EMPTY_STATE_MIN_WIDTH,
  MIN_PREVIEW_CONTAINER_WIDTH,
  RESIZE_HANDLE_WIDTH,
} from "./constants";
import type { RouteParams } from "./types";
import { clamp, getTableMetadataQuery, parseRouteParams } from "./utils";

interface Props {
  children: ReactNode;
  location: Location;
  params: RouteParams;
}

export const DataModel = ({ children, location, params }: Props) => {
  const { databaseId, fieldId, schemaName, tableId } = parseRouteParams(params);
  const previousTableId = usePrevious(tableId);
  const previousFieldId = usePrevious(fieldId);
  const isOpeningTableColumn = previousTableId == null && tableId != null;
  const isOpeningFieldColumn = previousFieldId == null && fieldId != null;
  const isSegments = location.pathname.startsWith("/admin/datamodel/segment");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [navWidth, setNavWidth] = useState(COLUMN_CONFIG.nav.initial);
  const [tableWidth, setTableWidth] = useState(COLUMN_CONFIG.table.initial);
  const [fieldWidth, setFieldWidth] = useState(COLUMN_CONFIG.field.initial);
  const { width } = useWindowSize();
  const { height, ref } = useElementSize();
  const isEmptyStateShown =
    databaseId == null || tableId == null || fieldId == null;
  const {
    data: table,
    error,
    isLoading,
  } = useGetTableQueryMetadataQuery(getTableMetadataQuery(tableId), {
    refetchOnMountOrArgChange: true,
  });
  const field = table?.fields?.find((field) => field.id === fieldId);
  const [previewType, setPreviewType] = useState<PreviewType>("table");

  const [isResizing, setIsResizing] = useState(false);
  const handleResizeStart = useCallback(() => setIsResizing(true), []);
  const handleResizeStop = useCallback(() => setIsResizing(false), []);

  const adjustLayout = (remainingWidth: number, neededWidth: number) => {
    const missingWidth = neededWidth - remainingWidth;

    if (missingWidth <= 0) {
      return;
    }

    const howMuchCanTableShrink = Math.max(
      tableWidth - COLUMN_CONFIG.table.min,
      0,
    );
    const howMuchCanFieldShrink = Math.max(
      fieldWidth - COLUMN_CONFIG.field.min,
      0,
    );
    const totalShrinkable = howMuchCanTableShrink + howMuchCanFieldShrink;

    if (totalShrinkable >= missingWidth) {
      // shrink columns proportionally
      const tableShrink =
        (howMuchCanTableShrink / totalShrinkable) * missingWidth;
      const fieldShrink =
        (howMuchCanFieldShrink / totalShrinkable) * missingWidth;

      setTableWidth(tableWidth - tableShrink);
      setFieldWidth(fieldWidth - fieldShrink);
    } else {
      setTableWidth(COLUMN_CONFIG.table.min);
      setFieldWidth(COLUMN_CONFIG.field.min);
    }
  };

  const handlePreviewClick = () => {
    const remainingWidth = Math.max(
      width - navWidth - tableWidth - fieldWidth,
      0,
    );
    adjustLayout(remainingWidth, MIN_PREVIEW_CONTAINER_WIDTH);
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

  useLayoutEffect(() => {
    if (isOpeningTableColumn) {
      const remainingWidth = Math.max(
        width - navWidth - EMPTY_STATE_MIN_WIDTH,
        0,
      );

      // take as much room as possible
      setTableWidth(clamp(remainingWidth, COLUMN_CONFIG.table));
    }
  }, [isOpeningTableColumn]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (isOpeningFieldColumn) {
      const resizeHandleSafety = RESIZE_HANDLE_WIDTH / 2 + 1;
      const remainingWidth = Math.max(
        width - navWidth - tableWidth - resizeHandleSafety,
        0,
      );

      adjustLayout(
        remainingWidth,
        isPreviewOpen ? MIN_PREVIEW_CONTAINER_WIDTH : fieldWidth,
      );
    }
  }, [isOpeningFieldColumn]); // eslint-disable-line react-hooks/exhaustive-deps

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
            schemaName={schemaName}
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
            </ResizableColumn>
          )}

          {!isEmptyStateShown && (
            <ResizableColumn
              height={height}
              constraints={COLUMN_CONFIG.field}
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
            </ResizableColumn>
          )}

          {!isEmptyStateShown && field && table && isPreviewOpen && (
            <Box flex="1" h="100%" p="xl">
              <Box
                h="100%"
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
