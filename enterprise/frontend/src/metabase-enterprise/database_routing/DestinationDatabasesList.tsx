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

export const DestinationDatabasesList = ({
  primaryDatabaseId,
  previewCount = Infinity,
}: {
  primaryDatabaseId: DatabaseId;
  previewCount?: number;
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const destinationDbsReq = useListDatabasesQuery({
    include_mirror_databases: primaryDatabaseId,
  });

  const destinationDatabases = useMemo(
    () => destinationDbsReq.data?.data ?? [],
    [destinationDbsReq],
  );

  return (
    <LoadingAndErrorWrapper
      loading={destinationDbsReq.isLoading}
      error={destinationDbsReq.error}
    >
      <Box>
        {destinationDatabases.length === 0 ? (
          <Text
            ta="center"
            mt="5rem"
            mb="3.5rem"
          >{t`No destination databases added yet`}</Text>
        ) : (
          <>
            <Text>{t`Name`}</Text>
            <Divider my="sm" />
            {destinationDatabases.slice(0, previewCount).map(({ id, name }) => (
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
                      to={`/admin/databases/${primaryDatabaseId}/destination-databases/${id}`}
                    >
                      Edit
                    </Menu.Item>
                    {isAdmin && (
                      <Menu.Item
                        component={ForwardRefLink}
                        to={`/admin/databases/${primaryDatabaseId}/destination-databases/${id}/remove`}
                      >
                        Remove
                      </Menu.Item>
                    )}
                  </Menu.Dropdown>
                </Menu>
              </Flex>
            ))}
            {destinationDatabases.length > previewCount && (
              <Text
                component={Link}
                c="brand"
                td="underline"
                to={`/admin/databases/${primaryDatabaseId}/destination-databases`}
              >
                View all {destinationDatabases.length}
              </Text>
            )}
          </>
        )}
      </Box>
    </LoadingAndErrorWrapper>
  );
};
