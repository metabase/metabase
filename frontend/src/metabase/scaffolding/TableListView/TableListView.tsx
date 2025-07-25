import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetTableQueryMetadataQuery,
  useUpdateTableComponentSettingsMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useTranslateContent } from "metabase/i18n/hooks";
import { useDispatch } from "metabase/lib/redux";
import { isSyncInProgress } from "metabase/lib/syncing";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { FieldId, StructuredDatasetQuery } from "metabase-types/api";

import { renderValue } from "../utils";

import { SortableFieldList } from "./SortableFieldList";
import S from "./TableListView.module.css";
import type { RouteParams } from "./types";
import {
  getDefaultComponentSettings,
  getExploreTableUrl,
  getRowCountQuery,
  getTableQuery,
  parseRouteParams,
} from "./utils";

interface Props {
  location: Location;
  params: RouteParams;
}

const PAGE_SIZE = 10;
const CELL_PADDING_HORIZONTAL = "md" as const;
const CELL_PADDING_VERTICAL = "xs" as const;

export const TableListView = ({ location, params }: Props) => {
  const dispatch = useDispatch();
  const tc = useTranslateContent();
  const { page, tableId } = parseRouteParams(location, params);
  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });

  // TODO: run paginated queries?
  // TODO: use only visible fields?
  const query = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getTableQuery(table) : undefined;
  }, [table]);
  const countQuery = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getRowCountQuery(table) : undefined;
  }, [table]);
  const { data: dataset } = useGetAdhocQueryQuery(query ? query : skipToken);
  const { data: countDataset } = useGetAdhocQueryQuery(
    countQuery ? countQuery : skipToken,
  );
  const count = countDataset?.data.rows?.[0]?.[0];
  const allColumns = useMemo(
    () => dataset?.data?.results_metadata?.columns ?? [],
    [dataset],
  );

  const [updateTableComponentSettings] =
    useUpdateTableComponentSettingsMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [settings, setSettings] = useState(
    table?.component_settings ?? getDefaultComponentSettings(table),
  );

  const pkIndex = allColumns.findIndex(isPK); // TODO: handle multiple PKs

  const handleOrderChange = (fieldOrder: FieldId[]) => {
    setSettings((settings) => ({
      ...settings,
      list_view: {
        ...settings.list_view,
        fields: fieldOrder.map((id) => {
          return settings.list_view.fields.find(
            (field) => field.field_id === id,
          )!;
        }),
      },
    }));
  };

  const handleSubmit = () => {
    setIsEditing(false);

    updateTableComponentSettings({ id: tableId, component_settings: settings });
  };

  useEffect(() => {
    if (table) {
      setSettings(
        table.component_settings ?? getDefaultComponentSettings(table),
      );
    }
  }, [table]);

  if (!table || !dataset || !allColumns) {
    return <LoadingAndErrorWrapper loading />;
  }

  const columns = settings.list_view.fields.map(({ field_id }) => {
    return allColumns.find((field) => field.id === field_id)!;
  });
  const fields = settings.list_view.fields.map(({ field_id }) => {
    return (table.fields ?? []).find((field) => field.id === field_id)!;
  });
  const visibleFields = settings.list_view.fields.map(({ field_id }) => {
    return fields.find((field) => field.id === field_id)!;
  });
  const hiddenFields = (table.fields ?? []).filter((field) =>
    settings.list_view.fields.every((f) => f.field_id !== field.id),
  );
  const allRows = dataset.data.rows;
  const paginatedRows = allRows.slice(PAGE_SIZE * page, PAGE_SIZE * (page + 1));

  // Transform paginatedRows to show only visible fields in their order
  const transformedPaginatedRows = paginatedRows.map((row) => {
    return settings.list_view.fields.map(({ field_id }) => {
      const fieldIndex = allColumns.findIndex((col) => col.id === field_id);
      return row[fieldIndex];
    });
  });

  return (
    <Stack gap="md" p="xl">
      <Group align="flex-start" justify="space-between">
        <Stack gap="xs">
          <Title>{table.display_name}</Title>
          {typeof count === "number" && (
            <Text c="text-secondary" size="sm">
              {count === 1 && t`1 row`}
              {count !== 1 && t`${count} rows`}
            </Text>
          )}
        </Stack>

        <Group align="center" gap="md">
          {!isEditing && (
            <PaginationControls
              itemsLength={paginatedRows.length}
              page={page}
              pageSize={PAGE_SIZE}
              onNextPage={() => {
                dispatch(push(`/table/${tableId}?page=${page + 1}`));
              }}
              onPreviousPage={() => {
                if (page === 1) {
                  dispatch(push(`/table/${tableId}`));
                } else {
                  dispatch(push(`/table/${tableId}?page=${page - 1}`));
                }
              }}
            />
          )}

          {!isSyncInProgress(table) && !isEditing && (
            <Button
              component={Link}
              leftSection={<Icon name="insight" />}
              to={getExploreTableUrl(table)}
              variant="primary"
            >{t`Explore results`}</Button>
          )}

          {!isEditing && (
            <Button
              leftSection={<Icon name="pencil" />}
              variant="outline"
              onClick={() => setIsEditing(true)}
            >
              {t`Edit`}
            </Button>
          )}
        </Group>
      </Group>

      <Group align="flex-start" gap="xl" wrap="nowrap">
        <Box flex="1" style={{ overflow: "auto" }}>
          <Box bg="white" className={S.table} component="table">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <Box
                    component="td"
                    key={index}
                    px={CELL_PADDING_HORIZONTAL}
                    py="md"
                  >
                    <Text c="text-secondary" size="sm">
                      {column.display_name}
                    </Text>
                  </Box>
                ))}

                <Box component="td" px="sm" py="md" />
              </tr>
            </thead>

            <tbody>
              {transformedPaginatedRows.map((row, index) => {
                return (
                  <Box className={S.row} component="tr" key={index}>
                    {row.map((value, cellIndex) => {
                      return (
                        <Box
                          c={
                            settings.list_view.fields[cellIndex].style === "dim"
                              ? "text-secondary"
                              : undefined
                          }
                          component="td"
                          fw={
                            settings.list_view.fields[cellIndex].style ===
                            "bold"
                              ? "bold"
                              : undefined
                          }
                          key={cellIndex}
                          px={CELL_PADDING_HORIZONTAL}
                          py={CELL_PADDING_VERTICAL}
                        >
                          {renderValue(tc, value, columns[cellIndex])}
                        </Box>
                      );
                    })}

                    <Box
                      component="td"
                      pr={CELL_PADDING_HORIZONTAL}
                      py={CELL_PADDING_VERTICAL}
                    >
                      <ActionIcon
                        className={S.link}
                        component={Link}
                        to={
                          pkIndex != null
                            ? `/table/${table.id}/detail/${paginatedRows[index][pkIndex]}`
                            : ""
                        }
                        variant="outline"
                      >
                        <Icon name="share" />
                      </ActionIcon>
                    </Box>
                  </Box>
                );
              })}
            </tbody>
          </Box>
        </Box>

        {isEditing && (
          <Stack flex="0 0 auto" miw={400}>
            <Group align="center" gap="md" justify="space-between">
              <Title order={2}>{t`Display settings`}</Title>

              {isEditing && (
                <Button
                  leftSection={<Icon name="check" />}
                  type="submit"
                  variant="filled"
                  onClick={handleSubmit}
                >
                  {t`Save`}
                </Button>
              )}
            </Group>

            <Text c="text-secondary" size="lg">{t`Shown columns`}</Text>
            <SortableFieldList
              fields={visibleFields}
              onChange={handleOrderChange}
              onToggleVisibility={(field) => {
                setSettings((settings) => ({
                  ...settings,
                  list_view: {
                    ...settings.list_view,
                    fields: settings.list_view.fields.filter(
                      (f) => f.field_id !== field.id,
                    ),
                  },
                }));
              }}
            />

            <Text c="text-secondary" size="lg">{t`Hidden columns`}</Text>
            <SortableFieldList
              disabled
              fields={hiddenFields}
              isHidden
              onChange={handleOrderChange}
              onToggleVisibility={(field) => {
                setSettings((settings) => ({
                  ...settings,
                  list_view: {
                    ...settings.list_view,
                    fields: [
                      ...settings.list_view.fields,
                      {
                        field_id: getRawTableFieldId(field),
                        style: "normal",
                      },
                    ],
                  },
                }));
              }}
            />
          </Stack>
        )}
      </Group>
    </Stack>
  );
};
