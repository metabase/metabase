import PropTypes from "prop-types";
import { connect } from "react-redux";

import CollectionItem from "metabase/components/CollectionItem";
import { CollectionGridItem } from "metabase/components/CollectionList/CollectionList.styled";
import { Grid } from "metabase/components/Grid";
import { getUser } from "metabase/selectors/user";

const propTypes = {
  collections: PropTypes.arrayOf(PropTypes.object).isRequired,
  currentUser: PropTypes.shape({
    personal_collection_id: PropTypes.number,
  }),
};

function mapStateToProps(state) {
  return {
    currentUser: getUser(state),
  };
}

function CollectionList({ collections, currentUser }) {
  return (
    <Grid>
      {collections
        .filter(c => c.id !== currentUser.personal_collection_id)
        .map(collection => (
          <CollectionGridItem key={collection.id}>
            <CollectionItem collection={collection} />
          </CollectionGridItem>
        ))}
    </Grid>
  );
}

CollectionList.propTypes = propTypes;

export default connect(mapStateToProps)(CollectionList);
