import { useListDatabasesQuery } from "metabase/api";
import Database from "metabase-lib/v1/metadata/Database";
import {
  Box,
  Divider,
  Flex,
  Icon,
  Menu,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

export const RoutedDatabaesList = ({
  previewCount = Infinity,
  database,
}: {
  previewCount?: number;
  database: Database;
}) => {
  // TODO: factor in loading
  const mirrorDbsReq = useListDatabasesQuery({
    include_mirror_databases: database.id,
  });
  const mirrorDatabases = useMemo(
    () => mirrorDbsReq.currentData?.data ?? [],
    [mirrorDbsReq],
  );

  // we have the DeleteDatabaseModal we should be able to reuse here

  // TODO: impl
  // TODO: made removal admin only
  const _handleRemoveDatabase = () => {};

  return (
    <Box>
      {mirrorDatabases.length === 0 ? (
        <Text
          ta="center"
          mt="5rem"
          mb="3.5rem"
        >{t`No destination databases added yet`}</Text>
      ) : (
        <>
          <Text>{t`Name`}</Text>
          <Divider my="sm" />
          {mirrorDatabases.slice(0, previewCount).map(({ id, name }) => (
            <Flex justify="space-between" my="md" key={id}>
              <Text key={id}>{name}</Text>
              <Menu shadow="md" width={200} position="bottom-end">
                <Menu.Target>
                  <UnstyledButton
                    onClick={() => {
                      /* TODO impl */
                    }}
                  >
                    <Icon name="ellipsis" />
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    component={Link}
                    to={`/admin/databases/${database.id}/mirror/${id}`}
                  >
                    Edit
                  </Menu.Item>
                  <Menu.Item
                    to={`/admin/databases/${database.id}/mirror/${id}/remove`}
                  >
                    Remove
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Flex>
          ))}
          {mirrorDatabases.length > previewCount && (
            <Text
              component={Link}
              c="brand"
              td="underline"
              to={`/admin/databases/${database.id}/mirrors`}
            >
              View all {mirrorDatabases.length}
            </Text>
          )}
        </>
      )}
    </Box>
  );
};
