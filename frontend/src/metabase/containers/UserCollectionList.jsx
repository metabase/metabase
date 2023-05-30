/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import { Grid } from "metabase/components/Grid";
import { Link } from "metabase/core/components/Link";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";

import User from "metabase/entities/users";
import Collection, {
  ROOT_COLLECTION,
  PERSONAL_COLLECTIONS,
} from "metabase/entities/collections";
import {
  CardContent,
  ListGridItem,
  ListHeader,
  ListRoot,
} from "./UserCollectionList.styled";

function mapStateToProps(state) {
  return {
    collectionsById: state.entities.collections,
  };
}

const UserCollectionList = ({ collectionsById }) => (
  <ListRoot>
    <ListHeader>
      <BrowserCrumbs
        crumbs={[
          { title: ROOT_COLLECTION.name, to: Urls.collection({ id: "root" }) },
          { title: PERSONAL_COLLECTIONS.name },
        ]}
      />
    </ListHeader>
    <User.ListLoader>
      {({ list }) => {
        return (
          <div>
            <Grid>
              {
                // map through all users that have logged in at least once
                // which gives them a personal collection ID
                list.map(
                  user =>
                    user.personal_collection_id && (
                      <ListGridItem key={user.personal_collection_id}>
                        <Link
                          to={Urls.collection(
                            collectionsById[user.personal_collection_id],
                          )}
                        >
                          <Card p={2} hoverable>
                            <CardContent>
                              <Icon
                                name="person"
                                mr={1}
                                color={color("text-medium")}
                                size={18}
                              />
                              <h3>{user.common_name}</h3>
                            </CardContent>
                          </Card>
                        </Link>
                      </ListGridItem>
                    ),
                )
              }
            </Grid>
          </div>
        );
      }}
    </User.ListLoader>
  </ListRoot>
);

export default Collection.loadList()(
  connect(mapStateToProps)(UserCollectionList),
);
