import React from "react";
import { t } from "c-3po";
import { Box, Flex } from "grid-styled";
import { connect } from "react-redux";

import { normal } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import Ellipsified from "metabase/components/Ellipsified";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";

const CollectionItem = ({ collection, color, iconName = "all" }) => (
  <Link
    to={`collection/${collection.id}`}
    hover={{ color: normal.blue }}
    color={color || normal.grey2}
  >
    <Box bg="#F4F6F8" p={2} mb={1}>
      <Flex align="center" py={1} key={`collection-${collection.id}`}>
        <Icon name={iconName} mx={1} color="#93B3C9" />
        <h4 className="overflow-hidden">
          <Ellipsified>{collection.name}</Ellipsified>
        </h4>
      </Flex>
    </Box>
  </Link>
);

@connect(({ currentUser }) => ({ currentUser }), null)
class CollectionList extends React.Component {
  render() {
    const { collections, currentUser, isRoot } = this.props;
    return (
      <Box>
        <Grid>
          {isRoot && (
            <GridItem w={1 / 4}>
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
              <GridItem w={1 / 4}>
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
          {collections
            .filter(c => c.id !== currentUser.personal_collection_id)
            .map(collection => (
              <GridItem w={1 / 4}>
                <CollectionDropTarget collection={collection}>
                  <ItemDragSource item={collection}>
                    <CollectionItem collection={collection} />
                  </ItemDragSource>
                </CollectionDropTarget>
              </GridItem>
            ))}
        </Grid>
      </Box>
    );
  }
}

export default CollectionList;
