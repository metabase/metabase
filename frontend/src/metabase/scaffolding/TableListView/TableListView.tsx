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
import type { StructuredDatasetQuery } from "metabase-types/api";

import { renderValue } from "../utils";

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
    table?.component_settings ?? getDefaultComponentSettings(table),
  );

  const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs

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
            {paginatedRows.map((row, index) => {
              return (
                <Box className={S.row} component="tr" key={index}>
                  {row.map((value, cellIndex) => {
                    return (
                      <Box
                        c={
                          settings.list_view.fields[index].style === "dim"
                            ? "text-secondary"
                            : undefined
                        }
                        component="td"
                        fw={
                          settings.list_view.fields[index].style === "bold"
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
                          ? `/table/${table.id}/detail/${row[pkIndex]}`
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

        {isEditing && <Stack>{t`Settings`}</Stack>}
      </Group>
    </Stack>
  );
};
