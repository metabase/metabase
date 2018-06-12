import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "c-3po";

import * as Urls from "metabase/lib/urls";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import { Grid, GridItem } from "metabase/components/Grid";
import Link from "metabase/components/Link";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";

const UserListLoader = ({ children, ...props }) => (
  <EntityListLoader entityType="users" children={children} {...props} />
);

const UserCollectionList = () => (
  <Box px={4}>
    <BrowserCrumbs
      crumbs={[
        { title: t`Saved items`, to: Urls.collection() },
        { title: t`Everyone else’s personal collections` },
      ]}
    />
    <UserListLoader>
      {({ list }) => {
        return (
          <Box>
            <Grid>
              {// map through all users that have logged in at least once
              // which gives them a personal collection ID
              list.map(
                user =>
                  user.personal_collection_id && (
                    <GridItem w={1 / 3} key={user.personal_collection_id}>
                      <Link
                        to={Urls.userCollection(user.personal_collection_id)}
                      >
                        <Card p={2} hoverable>
                          <Flex align="center">
                            <Icon
                              name="person"
                              mr={1}
                              color="#93B3C9"
                              size={22}
                            />
                            <h2>{user.common_name}</h2>
                          </Flex>
                        </Card>
                      </Link>
                    </GridItem>
                  ),
              )}
            </Grid>
          </Box>
        );
      }}
    </UserListLoader>
  </Box>
);

export default UserCollectionList;
