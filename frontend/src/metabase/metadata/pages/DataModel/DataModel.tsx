import cx from "classnames";
import { type ReactNode, useState } from "react";
import { useWindowSize } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { TableBreadcrumbs } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { ActionIcon, Box, Flex, Icon, Stack, Tooltip, rem } from "metabase/ui";

import S from "./DataModel.module.css";
import {
  FieldSection,
  PreviewSection,
  type PreviewType,
  RouterTablePicker,
  SegmentsLink,
  TableSection,
} from "./components";
import type { RouteParams } from "./types";
import { parseRouteParams } from "./utils";

export const DataModel = ({
  params,
  location,
  children,
}: {
  params: RouteParams;
  location: Location;
  children: ReactNode;
}) => {
  const { databaseId, tableId, schemaId } = parseRouteParams(params);

  return (
    <Flex bg="bg-light" h="100%">
      <Stack
        bg="bg-white"
        className={cx(S.column, S.borderRight)}
        flex="0 0 25%"
        gap={0}
        h="100%"
        miw={rem(320)}
      >
        <RouterTablePicker
          databaseId={databaseId}
          schemaId={schemaId}
          tableId={tableId}
        />

        <Box className={S.footer} mx="xl" py="sm">
          <SegmentsLink
            active={
              location.pathname.startsWith("/admin/datamodel/segments") ||
              location.pathname.startsWith("/admin/datamodel/segment/")
            }
            to="/admin/datamodel/segments"
          />
        </Box>
      </Stack>

      {children}
    </Flex>
  );
};

export function DataModelEditor({ params }: { params: RouteParams }) {
  const { databaseId, tableId, fieldId } = parseRouteParams(params);
  const isEmptyStateShown = databaseId == null || tableId == null;
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

  const { width } = useWindowSize();
  const isSmallScreen = width <= 1200;
  const isFieldOpen = fieldId != null;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <Stack className={S.root} gap={0} h="100%" w="100%">
      {tableId && (
        <Flex
          align="center"
          bg="white"
          className={S.borderBottom}
          flex="0 0 auto"
          gap="lg"
          px="xl"
          py="md"
        >
          <Tooltip label={t`Open sidebar`}>
            <ActionIcon
              c="text-dark"
              variant="transparent"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Icon name="sidebar_closed" />
            </ActionIcon>
          </Tooltip>

          <TableBreadcrumbs c="text-secondary" hideIcons tableId={tableId} />
        </Flex>
      )}

      <Flex className={S.content} flex="1" mih={0} w="100%">
        {tableId && (
          <Flex
            className={cx(S.column, S.borderRight)}
            flex={match({ isFieldOpen, isSidebarOpen, isSmallScreen })
              .with(
                {
                  isFieldOpen: true,
                  isSmallScreen: false,
                },
                () => "0 0 25%",
              )
              .with(
                {
                  isFieldOpen: true,
                  isSmallScreen: true,
                  isSidebarOpen: false,
                },
                () => "0 0 33%",
              )
              .otherwise(() => "1")}
            h="100%"
            justify="center"
            miw={rem(400)}
          >
            <Box maw={rem(640)}>
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
          </Flex>
        )}

        {isEmptyStateShown && (
          <Flex align="center" bg="accent-gray-light" flex="1" justify="center">
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

        {databaseId && field && (
          <Box
            className={S.column}
            flex={match({ isFieldOpen, isSidebarOpen, isSmallScreen })
              .with(
                {
                  isFieldOpen: true,
                  isSmallScreen: false,
                },
                () => "0 0 25%",
              )
              .with(
                {
                  isFieldOpen: true,
                  isSmallScreen: true,
                  isSidebarOpen: false,
                },
                () => "0 0 33%",
              )
              .otherwise(() => "1")}
            h="100%"
            miw={rem(400)}
          >
            <LoadingAndErrorWrapper error={error} loading={isLoading}>
              <FieldSection
                databaseId={databaseId}
                field={field}
                /**
                 * Make sure internal component state is reset when changing fields.
                 * This is to avoid state mix-up with optimistic updates.
                 */
                key={getRawTableFieldId(field)}
              />
            </LoadingAndErrorWrapper>
          </Box>
        )}

        {databaseId && fieldId && field && tableId && (
          <Box flex={`1 1 ${rem(200)}`} miw={rem(400)} p="xl">
            <PreviewSection
              databaseId={databaseId}
              field={field}
              fieldId={fieldId}
              previewType={previewType}
              tableId={tableId}
              onPreviewTypeChange={setPreviewType}
            />
          </Box>
        )}
      </Flex>
    </Stack>
  );
}
