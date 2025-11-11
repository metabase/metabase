import { Link } from "react-router";
import { t } from "ttag";

import { Box, Group, Icon, Loader, Stack, Text } from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api/dependencies";
import type { Table } from "metabase-types/api";

import S from "./TableModels.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

interface Props {
  table: Table;
}

export function TableModels({ table }: Props) {
  const {
    data: models,
    isLoading,
    error,
  } = useListNodeDependentsQuery({
    id: Number(table.id),
    type: "table",
    dependent_type: "card",
    dependent_card_type: "model",
    archived: false,
  });

  if (isLoading) {
    return (
      <Box p="md">
        <Group gap="sm">
          <Loader size="sm" />
          <Text c="text-medium">{t`Loading models...`}</Text>
        </Group>
      </Box>
    );
  }

  if (error) {
    return null;
  }

  if (!models || models.length === 0) {
    return null;
  }

  return (
    <Box px="lg">
      <TableSectionGroup title={t`This table has been published as a model`}>
        <Stack gap={8}>
          {models.map((model) => {
            if (!("name" in model.data) || !("collection" in model.data)) {
              return null;
            }
            return (
              <Box
                key={model.id}
                className={S.modelItem}
                component={Link}
                to={`/model/${model.id}`}
              >
                <Group gap={8} wrap="nowrap" align="flex-start">
                  <Icon name="model" size={16} c="brand" />
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Text fw="bold" size="md" lh="md" className={S.modelName}>
                      {model.data.name}
                    </Text>
                    {model.data.collection && (
                      <Text
                        c="text-medium"
                        size="xs"
                        lh="16px"
                        className={S.collectionName}
                      >
                        {model.data.collection.name}
                      </Text>
                    )}
                  </Stack>
                </Group>
              </Box>
            );
          })}
        </Stack>
      </TableSectionGroup>
    </Box>
  );
}
