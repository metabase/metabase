import React from "react";
import PropTypes from "prop-types";

import Card from "metabase/components/Card";
import Ellipsified from "metabase/components/Ellipsified";

import {
  ItemLink,
  IconContainer,
  CardContent,
  CollectionIcon,
} from "./CollectionItem.styled";

const propTypes = {
  collection: PropTypes.object.isRequired,
  iconName: PropTypes.string,
  event: PropTypes.string,
};

const CollectionItem = ({ collection, event, iconName }) => {
  return (
    <ItemLink to={collection.getUrl()} data-metabase-event={event}>
      <Card hoverable>
        <CardContent>
          <IconContainer>
            <CollectionIcon name={iconName} />
          </IconContainer>
          <h4 className="overflow-hidden">
            <Ellipsified>{collection.name}</Ellipsified>
          </h4>
        </CardContent>
      </Card>
    </ItemLink>
  );
};

CollectionItem.propTypes = propTypes;

CollectionItem.defaultProps = {
  iconName: "folder",
};

export default CollectionItem;
