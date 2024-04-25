import PropTypes from "prop-types";

import Card from "metabase/components/Card";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { getCollectionIcon } from "metabase/entities/collections";

import {
  ItemLink,
  IconContainer,
  CardContent,
  CollectionIcon,
} from "./CollectionItem.styled";

const propTypes = {
  collection: PropTypes.object.isRequired,
  event: PropTypes.string,
};

const CollectionItem = ({ collection, event }) => {
  const icon = getCollectionIcon(collection);
  return (
    <ItemLink to={collection.getUrl()}>
      <Card hoverable>
        <CardContent>
          <IconContainer color={icon.color}>
            <CollectionIcon name={icon.name} tooltip={icon.tooltip} />
          </IconContainer>
          <h4 className={CS.overflowHidden}>
            <Ellipsified>{collection.name}</Ellipsified>
          </h4>
        </CardContent>
      </Card>
    </ItemLink>
  );
};

CollectionItem.propTypes = propTypes;

export default CollectionItem;
