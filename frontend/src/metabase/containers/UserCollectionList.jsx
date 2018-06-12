import React from "react"
import { Box } from "grid-styled"

import * as Urls from "metabase/lib/urls"

import Card from "metabase/components/Card"
import { Grid, GridItem } from "metabase/components/Grid"
import Link from "metabase/components/Link"

import EntityListLoader from "metabase/entities/containers/EntityListLoader"

const UserListLoader = ({ children, ...props }) =>
  <EntityListLoader
    entityType="users"
    children={children}
    {...props}
  />

const UserCollectionList = () =>
  <Box px={4} py={3}>
    <UserListLoader>
      {({ list }) => {
        return (
          <Box>
            <Grid>
              {
                // map through all users that have logged in at least once
                // which gives them a personal collection ID
                list.map(user => user.personal_collection_id &&
                  <GridItem w={1 / 3} key={user.personal_collection_id}>
                    <Link to={Urls.userCollection(user.personal_collection_id)}>
                      <Card p={2} hoverable>
                        <h2>{ user.common_name }</h2>
                      </Card>
                    </Link>
                  </GridItem>
                )
              }
            </Grid>
          </Box>
        )
      }}
    </UserListLoader>
  </Box>

export default UserCollectionList
