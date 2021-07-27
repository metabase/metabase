import React from "react";
import PropTypes from "prop-types";
import { Box } from "grid-styled";
import { connect } from "react-redux";

import CollectionItem from "metabase/components/CollectionItem";
import { Grid, GridItem } from "metabase/components/Grid";

const propTypes = {
  collections: PropTypes.arrayOf(PropTypes.object).isRequired,
  currentUser: PropTypes.shape({
    personal_collection_id: PropTypes.number,
  }),
  w: PropTypes.arrayOf(PropTypes.number),
  analyticsContext: PropTypes.string,
};

@connect(
  ({ currentUser }) => ({ currentUser }),
  null,
)
class CollectionList extends React.Component {
  render() {
    const { analyticsContext, collections, currentUser, w } = this.props;
    return (
      <Box className="relative">
        <Grid>
          {collections
            .filter(c => c.id !== currentUser.personal_collection_id)
            .map(collection => (
              <GridItem w={w} key={collection.id}>
                <CollectionItem
                  collection={collection}
                  event={`${analyticsContext};Collection List;Collection click`}
                />
              </GridItem>
            ))}
        </Grid>
      </Box>
    );
  }
}

CollectionList.propTypes = propTypes;

CollectionList.defaultProps = {
  w: [1, 1 / 2, 1 / 4],
};

export default CollectionList;
