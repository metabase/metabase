import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { ForwardRefLink } from "metabase/core/components/Link";
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
import type { DatabaseId } from "metabase-types/api";

export const RoutedDatabaesList = ({
  primaryDatabaseId,
  previewCount = Infinity,
}: {
  primaryDatabaseId: DatabaseId;
  previewCount?: number;
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const mirrorDbsReq = useListDatabasesQuery({
    include_mirror_databases: primaryDatabaseId,
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
                      component={ForwardRefLink}
                      to={`/admin/databases/${primaryDatabaseId}/mirror/${id}`}
                    >
                      Edit
                    </Menu.Item>
                    {isAdmin && (
                      <Menu.Item
                        component={ForwardRefLink}
                        to={`/admin/databases/${primaryDatabaseId}/mirror/${id}/remove`}
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
                to={`/admin/databases/${primaryDatabaseId}/mirrors`}
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
