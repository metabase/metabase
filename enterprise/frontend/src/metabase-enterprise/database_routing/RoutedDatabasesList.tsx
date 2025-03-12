import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Box,
  Divider,
  Flex,
  Icon,
  Menu,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

export const RoutedDatabaesList = ({
  previewCount = Infinity,
  database,
}: {
  previewCount?: number;
  database: Database;
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const mirrorDbsReq = useListDatabasesQuery({
    include_mirror_databases: database.id,
  });

  const mirrorDatabases = useMemo(
    () => mirrorDbsReq.data?.data ?? [],
    [mirrorDbsReq],
  );

  return (
    <LoadingAndErrorWrapper
      loading={mirrorDbsReq.isLoading}
      error={mirrorDbsReq.error}
    >
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
                    <UnstyledButton>
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
                    {isAdmin && (
                      <Menu.Item
                        component={Link}
                        to={`/admin/databases/${database.id}/mirror/${id}/remove`}
                      >
                        Remove
                      </Menu.Item>
                    )}
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
    </LoadingAndErrorWrapper>
  );
};
