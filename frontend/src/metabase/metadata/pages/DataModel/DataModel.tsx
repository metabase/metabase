import cx from "classnames";
import { type ReactNode, useState } from "react";
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
        className={S.column}
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
    <>
      {tableId && (
        <Box
          className={cx(S.column, S.rightBorder)}
          flex="0 0 25%"
          h="100%"
          miw={rem(400)}
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

      {!isEmptyStateShown && (
        <>
          <Box className={S.column} flex="0 0 25%" h="100%" miw={rem(400)}>
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

          {field && (
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
  );
}
