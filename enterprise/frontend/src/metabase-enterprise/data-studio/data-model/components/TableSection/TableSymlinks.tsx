import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box, Group, Icon, Stack, Text } from "metabase/ui";
import type { TableSymlink } from "metabase-types/api";

import S from "./TableModels.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

interface Props {
  symlinks: TableSymlink[];
}

export function TableSymlinks({ symlinks }: Props) {
  const collections = symlinks
    .map((symlink) => symlink.collection)
    .filter((collection) => collection != null);

  return (
    <Box px="lg">
      <TableSectionGroup
        title={t`This table has been published to collections`}
      >
        <Stack gap={8}>
          {collections.map((collection) => {
            return (
              <Box
                key={collection.id}
                className={S.modelItem}
                component={Link}
                to={Urls.collection(collection)}
              >
                <Group gap={8} wrap="nowrap" align="flex-start">
                  <Icon name="folder" size={16} c="brand" />
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Text fw="bold" size="md" lh="md" className={S.modelName}>
                      {collection.name}
                    </Text>
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
