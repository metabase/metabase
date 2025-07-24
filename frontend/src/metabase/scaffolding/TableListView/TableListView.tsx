import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
import type { StructuredDatasetQuery } from "metabase-types/api";

import {
  detectDescriptionColumn,
  detectImageColumn,
  detectNameColumn,
  getExploreTableUrl,
  getRowCountQuery,
  getTableQuery,
  renderValue,
} from "./utils";

interface RouteParams {
  id: string;
}

interface Props {
  params: RouteParams;
}

export const TableListView = ({ params }: Props) => {
  const tableId = parseInt(params.id, 10);
  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });

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

  const [isEditing, setIsEditing] = useState(false);
  const [nameColumnIndex, setNameColumnIndex] = useState(-1);
  const [descriptionColumnIndex, setDescriptionColumnIndex] = useState(-1);
  const [imageColumnIndex, setImageColumnIndex] = useState(-1);
  const nameColumn = columns[nameColumnIndex];
  const descriptionColumn = columns[descriptionColumnIndex];
  const imageColumn = columns[imageColumnIndex];
  const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs

  useEffect(() => {
    if (!columns) {
      return;
    }

    const nameColumnIndex = detectNameColumn(columns);
    const descriptionColumnIndex = detectDescriptionColumn(columns);
    const imageColumnIndex = detectImageColumn(columns);

    if (nameColumnIndex !== -1) {
      setNameColumnIndex(nameColumnIndex);
    }

    if (descriptionColumnIndex !== -1) {
      setDescriptionColumnIndex(descriptionColumnIndex);
    }

    if (imageColumnIndex !== -1) {
      setImageColumnIndex(imageColumnIndex);
    }
  }, [columns]);

  if (!table || !dataset || !columns) {
    return <LoadingAndErrorWrapper loading />;
  }

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

        <Group align="flex-start" gap="md">
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
              variant="filled"
              onClick={() => setIsEditing(false)}
            >
              {t`Save`}
            </Button>
          )}
        </Group>
      </Group>

      <Group align="flex-start" gap="xl">
        <Stack component="ul" gap="md" w={isEditing ? 500 : 1000}>
          {dataset.data.rows.map((row, index) => {
            return (
              <Card component="li" key={index}>
                {imageColumnIndex !== -1 && (
                  <Card.Section mb="lg">
                    <Image
                      alt={
                        renderValue(row[nameColumnIndex], nameColumn) ??
                        t`Image`
                      }
                      h={160}
                      src={row[imageColumnIndex]}
                    />
                  </Card.Section>
                )}

                <Group justify="space-between">
                  <Link
                    to={
                      pkIndex != null
                        ? `/table/${table.id}/detail/${row[pkIndex]}`
                        : ""
                    }
                  >
                    <Text fw="bold">
                      {renderValue(row[nameColumnIndex], nameColumn)}
                    </Text>
                  </Link>
                </Group>

                {descriptionColumn && (
                  <Text c="text-secondary" size="sm">
                    {renderValue(
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
              onChange={(_value, option) => {
                const customOption = option as unknown as {
                  index: number;
                } | null;
                setNameColumnIndex(customOption ? customOption.index : -1);
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
              onChange={(_value, option) => {
                const customOption = option as unknown as {
                  index: number;
                } | null;
                setDescriptionColumnIndex(
                  customOption ? customOption.index : -1,
                );
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
              onChange={(_value, option) => {
                const customOption = option as unknown as {
                  index: number;
                } | null;
                setImageColumnIndex(customOption ? customOption.index : -1);
              }}
            />
          </Stack>
        )}
      </Group>
    </Stack>
  );
};
