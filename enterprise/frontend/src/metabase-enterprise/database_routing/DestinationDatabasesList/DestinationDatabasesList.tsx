import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { DatabaseConnectionHealthInfo } from "metabase/admin/databases/components/DatabaseConnectionHealthInfo";
import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { ForwardRefLink } from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Flex, Icon, Menu, Text, UnstyledButton } from "metabase/ui";
import * as Urls from "metabase-enterprise/urls";
import type { Database, DatabaseId } from "metabase-types/api";

export interface DestinationDatabasesListProps {
  primaryDatabaseId: DatabaseId;
  previewCount?: number;
}

export const DestinationDatabasesList = ({
  primaryDatabaseId,
  previewCount = Infinity,
}: DestinationDatabasesListProps) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const destinationDbsReq = useListDatabasesQuery({
    router_database_id: primaryDatabaseId,
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
            {destinationDatabases.slice(0, previewCount).map((db) => (
              <DestinationDatabasesListItem
                key={db.id}
                database={db}
                primaryDatabaseId={primaryDatabaseId}
                isAdmin={isAdmin}
              />
            ))}
            {destinationDatabases.length > previewCount && (
              <Text
                component={Link}
                c="brand"
                td="underline"
                to={Urls.viewDestinationDatabases(primaryDatabaseId)}
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

const DestinationDatabasesListItem = ({
  primaryDatabaseId,
  database,
  isAdmin,
}: {
  primaryDatabaseId: Database["id"];
  database: Database;
  isAdmin: boolean;
}) => {
  return (
    <Flex
      justify="space-between"
      my="md"
      data-testid="destination-db-list-item"
    >
      <Flex align="center" gap="sm">
        <DatabaseConnectionHealthInfo
          databaseId={database.id}
          displayText="tooltip"
          data-testid="destination-db-health-info"
        />
        <Text>{database.name}</Text>
      </Flex>
      <Menu shadow="md" width={200} position="bottom-end">
        <Menu.Target>
          <UnstyledButton>
            <Icon name="ellipsis" />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            component={ForwardRefLink}
            to={Urls.editDestinationDatabase(primaryDatabaseId, database.id)}
          >
            Edit
          </Menu.Item>
          {isAdmin && (
            <Menu.Item
              component={ForwardRefLink}
              to={Urls.removeDestinationDatabase(
                primaryDatabaseId,
                database.id,
              )}
            >
              Remove
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </Flex>
  );
};
