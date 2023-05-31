import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import CollectionItem from "metabase/components/CollectionItem";
import { Grid } from "metabase/components/Grid";

import { getUser } from "metabase/selectors/user";
import { CollectionGridItem } from "metabase/components/CollectionList/CollectionList.styled";

const propTypes = {
  collections: PropTypes.arrayOf(PropTypes.object).isRequired,
  currentUser: PropTypes.shape({
    personal_collection_id: PropTypes.number,
  }),
  analyticsContext: PropTypes.string,
};

function mapStateToProps(state) {
  return {
    currentUser: getUser(state),
  };
}

function CollectionList({ collections, currentUser, analyticsContext }) {
  return (
    <Grid>
      {collections
        .filter(c => c.id !== currentUser.personal_collection_id)
        .map(collection => (
          <CollectionGridItem key={collection.id}>
            <CollectionItem
              collection={collection}
              event={`${analyticsContext};Collection List;Collection click`}
            />
          </CollectionGridItem>
        ))}
    </Grid>
  );
}

CollectionList.propTypes = propTypes;

export default connect(mapStateToProps)(CollectionList);
