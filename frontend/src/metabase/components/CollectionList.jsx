import React from "react";
import { t } from "c-3po";
import { Box, Flex } from "grid-styled";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";

import CollectionItem from "metabase/components/CollectionItem"
import { normal } from "metabase/lib/colors";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";


@connect(({ currentUser }) => ({ currentUser }), null)
class CollectionList extends React.Component {
  render() {
    const {
      collections,
      currentUser,
      currentCollection,
      isRoot,
      w,
    } = this.props;
    return (
      <Box>
        <Grid>
          {collections
            .filter(c => c.id !== currentUser.personal_collection_id)
            .map(collection => (
              <GridItem w={w} key={collection.id}>
                <CollectionDropTarget collection={collection}>
                  <ItemDragSource item={collection}>
                    <CollectionItem collection={collection} />
                  </ItemDragSource>
                </CollectionDropTarget>
              </GridItem>
            ))}
          {isRoot && (
            <GridItem w={w}>
              <CollectionDropTarget
                collection={{ id: currentUser.personal_collection_id }}
              >
                <CollectionItem
                  collection={{
                    name: t`My personal collection`,
                    id: currentUser.personal_collection_id,
                  }}
                  iconName="star"
                />
              </CollectionDropTarget>
            </GridItem>
          )}
          {isRoot &&
            currentUser.is_superuser && (
              <GridItem w={w}>
                <CollectionItem
                  collection={{
                    name: t`Everyone else's personal collections`,
                    // Bit of a hack. The route /collection/users lists
                    // user collections but is not itself a colllection,
                    // but using the fake id users here works
                    id: "users",
                  }}
                  iconName="person"
                />
              </GridItem>
            )}
          {currentCollection &&
            currentCollection.can_write && (
              <GridItem w={w}>
                <Link
                  to={Urls.newCollection(currentCollection.id)}
                  color={normal.grey2}
                  hover={{ color: normal.blue }}
                >
                  <Box p={[1, 2]}>
                    <Flex align="center" py={1}>
                      <Icon name="add" mr={1} bordered />
                      <h4>{t`New collection`}</h4>
                    </Flex>
                  </Box>
                </Link>
              </GridItem>
            )}
        </Grid>
      </Box>
    );
  }
}

CollectionList.defaultProps = {
  w: [1, 1 / 2, 1 / 4],
};

export default CollectionList;
