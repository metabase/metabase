import { useEffect, useMemo, useState } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { Button, Card, Group, Image, Stack, Text, Title } from "metabase/ui";
import type { StructuredDatasetQuery } from "metabase-types/api";
import {
  isAvatarURL,
  isEmail,
  isEntityName,
  isImageURL,
} from "metabase-lib/v1/types/utils/isa";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

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
      console.log("name", columns[nameColumnIndex]);
      setNameColumnIndex(nameColumnIndex);
    }

    /////////////////////////////

    let descriptionColumnIndex = columns.findIndex(
      (column) => column.semantic_type === "type/Description",
    );

    if (descriptionColumnIndex === -1) {
      descriptionColumnIndex = columns.findIndex((column) => isEmail(column));
    }

    if (descriptionColumnIndex !== -1) {
      console.log("description", columns[descriptionColumnIndex]);
      setDescriptionColumnIndex(descriptionColumnIndex);
    }

    /////////////////////////////

    let imageColumnIndex = columns.findIndex((column) => isAvatarURL(column));

    if (imageColumnIndex === -1) {
      imageColumnIndex = columns.findIndex((column) => isImageURL(column));
    }

    if (imageColumnIndex !== -1) {
      console.log("image", columns[imageColumnIndex]);
      setImageColumnIndex(imageColumnIndex);
    }
  }, [columns]);

  if (!table || !dataset) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Stack gap="md" p="xl">
      <Group justify="space-between">
        <Title>{table.display_name}</Title>

        {!isEditing && (
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
        )}

        {isEditing && (
          <Button variant="filledz" onClick={() => setIsEditing(false)}>
            Save
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
                      src={row[imageColumnIndex]}
                      h={160}
                      alt={row[nameColumnIndex] ?? "Image"}
                    />
                  </Card.Section>
                )}

                <Group justify="space-between">
                  <Text fw={500}>{row[nameColumnIndex]}</Text>
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

        {isEditing && <Stack>Settings</Stack>}
      </Group>
    </Stack>
  );

  return null;
};
