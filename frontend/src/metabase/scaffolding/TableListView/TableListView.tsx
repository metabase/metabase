import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Button,
  Card,
  Group,
  Icon,
  Image,
  Select,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ComponentSettings,
  ListViewSettings,
  StructuredDatasetQuery,
} from "metabase-types/api";

import { renderValue } from "../utils";

import type { RouteParams } from "./types";
import {
  detectDescriptionColumn,
  detectImageColumn,
  detectNameColumn,
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

function getDefaultComponentSettings(): ComponentSettings {
  return {
    list_view: getDefaultListViewSettings(),
    object_view: {},
  };
}

function getDefaultListViewSettings(): ListViewSettings {
  return {
    slots: {
      description: {
        field_id: null,
      },
      name: {
        field_id: null,
      },
      image: {
        field_id: null,
      },
    },
  };
}

export const TableListView = ({ location, params }: Props) => {
  const dispatch = useDispatch();
  const tc = useTranslateContent();
  const { page, tableId } = parseRouteParams(location, params);
  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });

  // TODO: run paginated queries?
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
  const columns = useMemo(
    () => dataset?.data?.results_metadata?.columns ?? [],
    [dataset],
  );

  const [updateTableComponentSettings] =
    useUpdateTableComponentSettingsMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [settings, setSettings] = useState(
    table?.component_settings ?? getDefaultComponentSettings(),
  );
  const slots = settings.list_view.slots;
  const nameColumnIndex = columns.findIndex(
    (column) => column.id === slots.name.field_id,
  );
  const descriptionColumnIndex = columns.findIndex(
    (column) => column.id === slots.description.field_id,
  );
  const imageColumnIndex = columns.findIndex(
    (column) => column.id === slots.image.field_id,
  );
  const nameColumn = columns[nameColumnIndex];
  const descriptionColumn = columns[descriptionColumnIndex];
  const imageColumn = columns[imageColumnIndex];
  const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs

  const updateSlots = useCallback(
    (slots: Partial<ListViewSettings["slots"]>) => {
      setSettings((settings) => ({
        ...settings,
        list_view: {
          ...settings.list_view,
          slots: {
            ...settings.list_view.slots,
            ...slots,
          },
        },
      }));
    },
    [],
  );

  const handleSubmit = () => {
    setIsEditing(false);

    updateTableComponentSettings({ id: tableId, component_settings: settings });
  };

  useEffect(() => {
    if (table?.component_settings) {
      setSettings(table.component_settings);
    }
  }, [table]);

  useEffect(() => {
    if (!columns) {
      return;
    }

    const nameColumn = detectNameColumn(columns);
    const descriptionColumn = detectDescriptionColumn(columns);
    const imageColumn = detectImageColumn(columns);

    if (nameColumn) {
      updateSlots({
        name: {
          field_id: nameColumn.id ?? null,
        },
      });
    }

    if (descriptionColumn) {
      updateSlots({
        description: {
          field_id: descriptionColumn.id ?? null,
        },
      });
    }

    if (imageColumn) {
      updateSlots({
        image: {
          field_id: imageColumn.id ?? null,
        },
      });
    }
  }, [columns, updateSlots]);

  if (!table || !dataset || !columns) {
    return <LoadingAndErrorWrapper loading />;
  }

  const allRows = dataset.data.rows;
  const paginatedRows = allRows.slice(PAGE_SIZE * page, PAGE_SIZE * (page + 1));

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
      </Group>

      <Group align="flex-start" gap="xl">
        <Stack component="ul" gap="md" w={isEditing ? 500 : 1000}>
          {paginatedRows.map((row, index) => {
            return (
              <Card component="li" key={index}>
                {imageColumnIndex !== -1 && (
                  <Card.Section mb="lg">
                    <Image alt={t`Image`} h={160} src={row[imageColumnIndex]} />
                  </Card.Section>
                )}

                <Link
                  to={
                    pkIndex != null
                      ? `/table/${table.id}/detail/${row[pkIndex]}`
                      : ""
                  }
                >
                  <Text fw="bold">
                    {renderValue(tc, row[nameColumnIndex], nameColumn)}
                  </Text>
                </Link>

                {descriptionColumn && (
                  <Text c="text-secondary" size="sm">
                    {renderValue(
                      tc,
                      row[descriptionColumnIndex],
                      descriptionColumn,
                    )}
                  </Text>
                )}
              </Card>
            );
          })}
        </Stack>

        {isEditing && (
          <Stack>
            <Select
              clearable
              data={columns.map((column, index) => ({
                label: column.display_name,
                value: String(column.id),
                index,
              }))}
              label={t`Name`}
              placeholder={t`Select a column`}
              value={String(nameColumn?.id)}
              onChange={(value) => {
                updateSlots({
                  name: {
                    field_id: parseInt(value, 10),
                  },
                });
              }}
            />

            <Select
              clearable
              data={columns.map((column, index) => ({
                label: column.display_name,
                value: String(column.id),
                index,
              }))}
              label={t`Description`}
              placeholder={t`Select a column`}
              value={String(descriptionColumn?.id)}
              onChange={(value) => {
                updateSlots({
                  description: {
                    field_id: parseInt(value, 10),
                  },
                });
              }}
            />

            <Select
              clearable
              data={columns.map((column, index) => ({
                label: column.display_name,
                value: String(column.id),
                index,
              }))}
              label={t`Image`}
              placeholder={t`Select a column`}
              value={String(imageColumn?.id)}
              onChange={(value) => {
                updateSlots({
                  image: {
                    field_id: parseInt(value, 10),
                  },
                });
              }}
            />
          </Stack>
        )}
      </Group>
    </Stack>
  );
};
