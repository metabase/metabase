import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box, Group, Icon, Stack, Text } from "metabase/ui";
import type { Table } from "metabase-types/api";

import S from "./TableModels.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

interface Props {
  table: Table;
}

export function TableModels({ table }: Props) {
  if (table.published_models == null || table.published_models.length === 0) {
    return null;
  }

  return (
    <Box px="lg">
      <TableSectionGroup title={t`This table has been published as a model`}>
        <Stack gap={8}>
          {table.published_models.map((model) => {
            return (
              <Box
                key={model.id}
                className={S.modelItem}
                component={Link}
                to={Urls.dataStudioModel(model.id)}
              >
                <Group gap={8} wrap="nowrap" align="flex-start">
                  <Icon name="model" size={16} c="brand" />
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Text fw="bold" size="md" lh="md" className={S.modelName}>
                      {model.name}
                    </Text>
                    {model.collection && (
                      <Text
                        c="text-medium"
                        size="xs"
                        lh="16px"
                        className={S.collectionName}
                      >
                        {model.collection.name}
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
