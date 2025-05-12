import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Box, Flex, Stack, Title } from "metabase/ui";

import S from "./DataModel.module.css";
import {
  FieldSection,
  PreviewSection,
  RouterTablePicker,
  TableSection,
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

  return (
    <Flex h={`calc(100% - ${DATA_MODEL_APP_NAV_BAR_HEIGHT}px)`}>
      <Stack className={S.sidebar} flex="0 0 320px" gap={0} h="100%">
        <Title order={2} px="xl" py="lg" pb="md">
          {t`Data model`}
        </Title>

        <RouterTablePicker
          databaseId={databaseId}
          schemaId={schemaId}
          tableId={tableId}
        />
      </Stack>

      {tableId && (
        <Stack className={S.sidebar} flex="0 0 400px" gap={0} h="100%">
          <Box className={S.tableSectionContainer} h="100%" p="xl" pb="lg">
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
        <Flex bg="accent-gray-light" flex="1">
          <Box flex="0 0 400px" h="100%">
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

          <Box flex="1" p="xl" pl={0}>
            <PreviewSection fieldId={fieldId} />
          </Box>
        </Flex>
      )}
    </Flex>
  );
};
