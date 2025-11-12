import {
  STANDARD_USER_LIST_PAGE_SIZE as PAGE_SIZE,
  useListUsersQuery,
} from "metabase/api";
import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import Card from "metabase/common/components/Card";
import { Grid } from "metabase/common/components/Grid";
import Link from "metabase/common/components/Link";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { usePagination } from "metabase/common/hooks/use-pagination";
import CS from "metabase/css/core/index.css";
import {
  PERSONAL_COLLECTIONS,
  ROOT_COLLECTION,
} from "metabase/entities/collections/constants";
import * as Urls from "metabase/lib/urls";
import { Box, Flex, Icon, Loader } from "metabase/ui";

import {
  CardContent,
  ListGridItem,
  ListHeader,
} from "./UserCollectionList.styled";

export const UserCollectionList = () => {
  const { page, handleNextPage, handlePreviousPage } = usePagination();

  const { data, isLoading } = useListUsersQuery({
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  });

  const users = data?.data ?? [];
  const total = data?.total;

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
              (user) =>
                user.personal_collection_id && (
                  <ListGridItem
                    key={user.personal_collection_id}
                    role="list-item"
                  >
                    <Link to={`/collection/${user.personal_collection_id}`}>
                      <Card className={CS.p2} hoverable>
                        <CardContent>
                          <Icon
                            name="person"
                            className={CS.mr1}
                            c="text-secondary"
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
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          itemsLength={PAGE_SIZE}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
        />
      </Flex>
    </Flex>
  );
};
