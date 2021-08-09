import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import CollectionItem from "metabase/components/CollectionItem";
import { Grid, GridItem } from "metabase/components/Grid";

import { getUser } from "metabase/selectors/user";

const propTypes = {
  collections: PropTypes.arrayOf(PropTypes.object).isRequired,
  currentUser: PropTypes.shape({
    personal_collection_id: PropTypes.number,
  }),
  w: PropTypes.arrayOf(PropTypes.number),
  analyticsContext: PropTypes.string,
};

function mapStateToProps(state) {
  return {
    currentUser: getUser(state),
  };
}

function CollectionList({
  collections,
  currentUser,
  w = [1, 1 / 2, 1 / 4],
  analyticsContext,
}) {
  return (
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
  );
}

CollectionList.propTypes = propTypes;

export default connect(mapStateToProps)(CollectionList);
