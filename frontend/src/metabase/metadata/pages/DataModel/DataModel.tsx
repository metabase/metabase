import { useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useState } from "react";
import { ResizableBox } from "react-resizable";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Box, Flex, Stack, rem } from "metabase/ui";

import S from "./DataModel.module.css";
import {
  FieldSection,
  PreviewSection,
  type PreviewType,
  ResizeHandle,
  RouterTablePicker,
  SegmentsLink,
  TableSection,
} from "./components";
import type { RouteParams } from "./types";
import { parseRouteParams } from "./utils";

type Column = "nav" | "table" | "field";

interface ColumnSizeConfig {
  initial: number;
  min: number;
  max: number;
}

const columnSizesConfig: Record<Column, ColumnSizeConfig> = {
  nav: { initial: 320, min: 240, max: 440 },
  table: { initial: 320, min: 240, max: 640 },
  field: { initial: 480, min: 240, max: 640 },
};

export const DataModel = ({
  params,
  location,
  children,
}: {
  params: RouteParams;
  location: Location;
  children: ReactNode;
}) => {
  const { databaseId, fieldId, tableId, schemaId } = parseRouteParams(params);
  const isSegments = location.pathname.startsWith("/admin/datamodel/segment");
  const [isResizing, setIsResizing] = useState(false);
  const [navWidth, setNavWidth] = useState(columnSizesConfig.nav.initial);
  const [tableWidth, setTableWidth] = useState(columnSizesConfig.table.initial);
  const { height, ref } = useElementSize();
  const isEmptyStateShown =
    databaseId == null || tableId == null || fieldId == null;
  const {
    data: table,
    error,
    isLoading,
  } = useGetTableQueryMetadataQuery(
    tableId == null
      ? skipToken
      : {
          id: tableId,
          include_sensitive_fields: true,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        },
  );
  const field = table?.fields?.find((field) => field.id === fieldId);
  const [previewType, setPreviewType] = useState<PreviewType>("table");

  return (
    <Flex
      bg="bg-light"
      className={cx({ [S.resizing]: isResizing })}
      h="100%"
      ref={ref}
    >
      <ResizableBox
        axis="x"
        handle={<ResizeHandle />}
        height={height}
        maxConstraints={[columnSizesConfig.nav.max, height]}
        minConstraints={[columnSizesConfig.nav.min, height]}
        resizeHandles={["e"]}
        width={navWidth}
        onResize={(_event, data) => setNavWidth(data.size.width)}
        onResizeStart={() => setIsResizing(true)}
        onResizeStop={() => setIsResizing(false)}
      >
        <Stack
          bg="accent-gray-light"
          className={cx(S.column, S.rightBorder)}
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
      </ResizableBox>

      {isSegments && children}

      {!isSegments && (
        <>
          {tableId && (
            <ResizableBox
              axis="x"
              handle={<ResizeHandle />}
              height={height}
              maxConstraints={[columnSizesConfig.table.max, height]}
              minConstraints={[columnSizesConfig.table.min, height]}
              resizeHandles={["e"]}
              width={tableWidth}
              onResize={(_event, data) => setTableWidth(data.size.width)}
              onResizeStart={() => setIsResizing(true)}
              onResizeStop={() => setIsResizing(false)}
            >
              <Box
                bg="bg-white"
                className={cx(S.column, S.rightBorder)}
                h="100%"
                w={tableWidth}
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
                    />
                  )}
                </LoadingAndErrorWrapper>
              </Box>
            </ResizableBox>
          )}

          {isEmptyStateShown && (
            <Flex align="center" bg="bg-white" flex="1" justify="center">
              <Box maw={rem(320)}>
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
            <>
              <Box
                bg="bg-white"
                className={S.column}
                flex="0 0 25%"
                h="100%"
                miw={rem(400)}
              >
                <LoadingAndErrorWrapper error={error} loading={isLoading}>
                  {field && (
                    <FieldSection
                      databaseId={databaseId}
                      field={field}
                      /**
                       * Make sure internal component state is reset when changing fields.
                       * This is to avoid state mix-up with optimistic updates.
                       */
                      key={getRawTableFieldId(field)}
                    />
                  )}
                </LoadingAndErrorWrapper>
              </Box>

              {field && table && (
                <Box flex={`1 1 ${rem(200)}`} miw={0} p="xl">
                  <PreviewSection
                    databaseId={databaseId}
                    field={field}
                    fieldId={fieldId}
                    previewType={previewType}
                    table={table}
                    tableId={tableId}
                    onPreviewTypeChange={setPreviewType}
                  />
                </Box>
              )}
            </>
          )}
        </>
      )}
    </Flex>
  );
};
