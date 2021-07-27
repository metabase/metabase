/* eslint-disable react/prop-types */
import React from "react";
import { Box } from "grid-styled";
import { connect } from "react-redux";

import CollectionItem from "metabase/components/CollectionItem";
import { Grid, GridItem } from "metabase/components/Grid";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";

@connect(
  ({ currentUser }) => ({ currentUser }),
  null,
)
class CollectionList extends React.Component {
  render() {
    const {
      analyticsContext,
      collections,
      currentUser,
      currentCollection,
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
                      <div>
                        <CollectionItem
                          collection={collection}
                          highlighted={highlighted}
                          hovered={hovered}
                          event={`${analyticsContext};Collection List;Collection click`}
                          asCard={asCards}
                        />
                      </div>
                    </ItemDragSource>
                  )}
                </CollectionDropTarget>
              </GridItem>
            ))}
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
