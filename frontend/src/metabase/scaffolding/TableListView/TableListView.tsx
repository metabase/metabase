import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Button,
  Card,
  Group,
  Image,
  Select,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import {
  isAvatarURL,
  isEmail,
  isEntityName,
  isImageURL,
} from "metabase-lib/v1/types/utils/isa";
import type { StructuredDatasetQuery } from "metabase-types/api";

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
    if (!table) {
      return undefined;
    }

    return {
      database: table.db_id,
      query: {
        "source-table": table.id,
      },
      type: "query",
    };
  }, [table]);

  const { data: dataset } = useGetAdhocQueryQuery(query ? query : skipToken);
  const columns = dataset?.data?.results_metadata?.columns;

  const [isEditing, setIsEditing] = useState(false);
  const [nameColumnIndex, setNameColumnIndex] = useState(-1);
  const [descriptionColumnIndex, setDescriptionColumnIndex] = useState(-1);
  const [imageColumnIndex, setImageColumnIndex] = useState(-1);

  useEffect(() => {
    if (!columns) {
      return;
    }

    /* name */

    let nameColumnIndex = columns.findIndex((column) => isEntityName(column));

    if (nameColumnIndex === -1) {
      nameColumnIndex = columns.findIndex(
        (column) => column.semantic_type === "type/Title",
      );
    }

    if (nameColumnIndex === -1) {
      nameColumnIndex = columns.findIndex((column) => isEmail(column));
    }

    if (nameColumnIndex !== -1) {
      setNameColumnIndex(nameColumnIndex);
    }

    /* description */

    let descriptionColumnIndex = columns.findIndex(
      (column) => column.semantic_type === "type/Description",
    );

    if (descriptionColumnIndex === -1) {
      descriptionColumnIndex = columns.findIndex((column) => isEmail(column));
    }

    if (descriptionColumnIndex !== -1) {
      setDescriptionColumnIndex(descriptionColumnIndex);
    }

    /* image */

    let imageColumnIndex = columns.findIndex((column) => isAvatarURL(column));

    if (imageColumnIndex === -1) {
      imageColumnIndex = columns.findIndex((column) => isImageURL(column));
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
      <Group justify="space-between">
        <Title>{table.display_name}</Title>

        {!isEditing && (
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            {t`Edit`}
          </Button>
        )}

        {isEditing && (
          <Button variant="filledz" onClick={() => setIsEditing(false)}>
            {t`Save`}
          </Button>
        )}
      </Group>

      <Group align="flex-start" gap="xl">
        <Stack component="ul" gap="md" w={isEditing ? 500 : 1000}>
          {dataset.data.rows.map((row, index) => {
            // dataset.data.cols;

            return (
              <Card component="li" key={index}>
                {imageColumnIndex !== -1 && (
                  <Card.Section mb="lg">
                    <Image
                      alt={row[nameColumnIndex] ?? t`Image`}
                      h={160}
                      src={row[imageColumnIndex]}
                    />
                  </Card.Section>
                )}

                <Group justify="space-between">
                  <Text fw="bold">{row[nameColumnIndex]}</Text>
                </Group>

                {descriptionColumnIndex !== -1 && (
                  <Text c="text-secondary" size="sm">
                    {row[descriptionColumnIndex]}
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
              value={String(columns[nameColumnIndex]?.id)}
              onChange={(_value, option) => {
                setNameColumnIndex(option ? option.index : -1);
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
              value={String(columns[descriptionColumnIndex]?.id)}
              onChange={(_value, option) => {
                setDescriptionColumnIndex(option ? option.index : -1);
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
              value={String(columns[imageColumnIndex]?.id)}
              onChange={(_value, option) => {
                setImageColumnIndex(option ? option.index : -1);
              }}
            />
          </Stack>
        )}
      </Group>
    </Stack>
  );

  return null;
};
