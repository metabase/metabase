import cx from "classnames";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Box, Flex, Stack } from "metabase/ui";

import S from "./DataModel.module.css";
import {
  FieldSection,
  PreviewSection,
  RouterTablePicker,
  TableSection,
  usePreviewType,
} from "./components";
import type { RouteParams } from "./types";
import { parseRouteParams } from "./utils";

interface Props {
  params: RouteParams;
}

const DATA_MODEL_APP_NAV_BAR_HEIGHT = 53;

export const DataModel = ({ params }: Props) => {
  const { databaseId, tableId, schemaId, fieldId } = parseRouteParams(params);
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
  const [previewType, setPreviewType] = usePreviewType();

  return (
    <Flex h={`calc(100% - ${DATA_MODEL_APP_NAV_BAR_HEIGHT}px)`} bg="bg-light">
      <Stack
        className={S.sidebar}
        flex="0 0 25%"
        miw="320px"
        gap={0}
        h="100%"
        bg="bg-white"
      >
        <RouterTablePicker
          databaseId={databaseId}
          schemaId={schemaId}
          tableId={tableId}
        />
      </Stack>

      {tableId && (
        <Box className={S.sidebar} flex="0 0 25%" h="100%" miw="400px">
          <Box p="xl" pb="lg">
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
        </Box>
      )}

      {isEmptyStateShown && (
        <Flex align="center" bg="accent-gray-light" flex="1" justify="center">
          <Box maw={320}>
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
            flex="0 0 25%"
            h="100%"
            miw="400px"
            className={cx(S.sidebar, S.noBorder)}
          >
            <Box p="xl" pb="lg">
              <LoadingAndErrorWrapper
                className={S.contentLoadingAndErrorWrapper}
                error={error}
                loading={isLoading}
              >
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
          </Box>

          {field && (
            <Box flex="1 1 200px" p="xl" pl={0} miw={0}>
              <PreviewSection
                databaseId={databaseId}
                tableId={tableId}
                fieldId={fieldId}
                field={field}
                previewType={previewType}
                onPreviewTypeChange={setPreviewType}
              />
            </Box>
          )}
        </>
      )}
    </Flex>
  );
};
