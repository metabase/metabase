import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import { Icon } from "metabase/core/components/Icon";
import { Grid } from "metabase/components/Grid";
import Link from "metabase/core/components/Link";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";

import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import PaginationControls from "metabase/components/PaginationControls";

import { Box, Flex, Loader } from "metabase/ui";
import {
  ROOT_COLLECTION,
  PERSONAL_COLLECTIONS,
} from "metabase/entities/collections";

import { usePeopleQuery } from "metabase/admin/people/hooks/use-people-query";
import {
  CardContent,
  ListGridItem,
  ListHeader,
} from "./UserCollectionList.styled";

const PAGE_SIZE = 27;

export const UserCollectionList = () => {
  const { query, handleNextPage, handlePreviousPage } =
    usePeopleQuery(PAGE_SIZE);

  const {
    data: users = [],
    isLoading,
    metadata,
  } = useUserListQuery({
    query: {
      limit: query.pageSize,
      offset: query.pageSize * query.page,
    },
  });

  return (
    <Flex direction="column" p="1.5rem" h="100%">
      <ListHeader>
        <BrowserCrumbs
          crumbs={[
            {
              title: ROOT_COLLECTION.name,
              to: Urls.collection({ id: "root", name: "" }),
            },
            { title: PERSONAL_COLLECTIONS.name },
          ]}
          analyticsContext="user-collections"
        />
      </ListHeader>
      <Box style={{ flexGrow: 1, overflowY: "auto" }} pr="0.5rem">
        {isLoading ? (
          <Flex justify="center" align="center" h="100%">
            <Loader size="lg" />
          </Flex>
        ) : (
          <Grid>
            {users.map(
              user =>
                user.personal_collection_id && (
                  <ListGridItem
                    key={user.personal_collection_id}
                    role="list-item"
                  >
                    <Link to={`/collection/${user.personal_collection_id}`}>
                      <Card className="p2" hoverable>
                        <CardContent>
                          <Icon
                            name="person"
                            className="mr1"
                            color={color("text-medium")}
                            size={18}
                          />
                          <h3>{user.common_name}</h3>
                        </CardContent>
                      </Card>
                    </Link>
                  </ListGridItem>
                ),
            )}
          </Grid>
        )}
      </Box>
      <Flex justify="end">
        <PaginationControls
          page={query.page}
          pageSize={PAGE_SIZE}
          total={metadata?.total}
          itemsLength={PAGE_SIZE}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
        />
      </Flex>
    </Flex>
  );
};
