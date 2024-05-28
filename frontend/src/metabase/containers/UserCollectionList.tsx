import { useUserListQuery } from "metabase/common/hooks";
import { BrowserCrumbs } from "metabase/components/BrowserCrumbs";
import Card from "metabase/components/Card";
import { Grid } from "metabase/components/Grid";
import PaginationControls from "metabase/components/PaginationControls";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import {
  ROOT_COLLECTION,
  PERSONAL_COLLECTIONS,
} from "metabase/entities/collections";
import { usePagination } from "metabase/hooks/use-pagination";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Icon, Box, Flex, Loader } from "metabase/ui";

import {
  CardContent,
  ListGridItem,
  ListHeader,
} from "./UserCollectionList.styled";

const PAGE_SIZE = 27;

export const UserCollectionList = () => {
  const { page, handleNextPage, handlePreviousPage } = usePagination();

  const {
    data: users = [],
    isLoading,
    metadata,
  } = useUserListQuery({
    query: {
      limit: PAGE_SIZE,
      offset: PAGE_SIZE * page,
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
                      <Card className={CS.p2} hoverable>
                        <CardContent>
                          <Icon
                            name="person"
                            className={CS.mr1}
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
          page={page}
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
