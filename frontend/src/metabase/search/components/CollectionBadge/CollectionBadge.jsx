import PropTypes from "prop-types";

import * as Urls from "metabase/lib/urls";

import {
  CollectionBadgeRoot,
  CollectionLink,
  AuthorityLevelIcon,
} from "./CollectionBadge.styled";

const propTypes = {
  collection: PropTypes.shape({
    name: PropTypes.string,
  }),
};

export function CollectionBadge({ collection }) {
  return (
    <CollectionBadgeRoot>
      <CollectionLink to={Urls.collection(collection)}>
        <AuthorityLevelIcon collection={collection} />
        {collection.name}
      </CollectionLink>
    </CollectionBadgeRoot>
  );
}

CollectionBadge.propTypes = propTypes;
