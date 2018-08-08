import React from "react";
import { t } from "c-3po";
import { Box, Flex } from "grid-styled";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";

import CollectionItem from "metabase/components/CollectionItem";
import { normal } from "metabase/lib/colors";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";

import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

@connect(({ currentUser }) => ({ currentUser }), null)
class CollectionList extends React.Component {
  render() {
    const {
      analyticsContext,
      collections,
      currentUser,
      currentCollection,
      isRoot,
      w,
      asCards,
    } = this.props;
    return (
      <Box className="relative">
        <Grid>
          {collections
            .filter(c => c.id !== currentUser.personal_collection_id)
            .map(collection => (
              <GridItem w={w} key={collection.id}>
                <CollectionDropTarget collection={collection}>
                  {({ highlighted, hovered }) => (
                    <ItemDragSource
                      item={collection}
                      collection={currentCollection}
                    >
                      <CollectionItem
                        collection={collection}
                        highlighted={highlighted}
                        hovered={hovered}
                        event={`${analyticsContext};Collection List;Collection click`}
                        asCard={asCards}
                      />
                    </ItemDragSource>
                  )}
                </CollectionDropTarget>
              </GridItem>
            ))}
          {isRoot && (
            <GridItem w={w} className="relative">
              <CollectionDropTarget
                collection={{ id: currentUser.personal_collection_id }}
              >
                {({ highlighted, hovered }) => (
                  <CollectionItem
                    collection={{
                      name: t`My personal collection`,
                      id: currentUser.personal_collection_id,
                    }}
                    iconName="star"
                    highlighted={highlighted}
                    hovered={hovered}
                    event={`${analyticsContext};Collection List;Personal collection click`}
                    asCard={asCards}
                  />
                )}
              </CollectionDropTarget>
            </GridItem>
          )}
          {isRoot &&
            currentUser.is_superuser && (
              <GridItem w={w}>
                <CollectionItem
                  collection={{
                    name: PERSONAL_COLLECTIONS.name,
                    // Bit of a hack. The route /collection/users lists
                    // user collections but is not itself a colllection,
                    // but using the fake id users here works
                    id: "users",
                  }}
                  iconName="person"
                  event={`${analyticsContext};Collection List;All user collecetions click`}
                  asCard={asCards}
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
                  p={w === 1 ? [1, 2] : 0}
                  data-metabase-event={`${analyticsContext};Collection List; New Collection Click`}
                >
                  <Flex align="center" py={1}>
                    <Icon name="add" mr={1} bordered />
                    <h4>{t`New collection`}</h4>
                  </Flex>
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
  asCards: false,
};

export default CollectionList;
