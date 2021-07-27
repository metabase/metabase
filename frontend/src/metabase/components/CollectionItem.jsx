import React from "react";
import PropTypes from "prop-types";
import { Flex } from "grid-styled";

import Card from "metabase/components/Card";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { color } from "metabase/lib/colors";

const propTypes = {
  collection: PropTypes.object.isRequired,
  iconName: PropTypes.string,
  event: PropTypes.string,
};

const CollectionItem = ({ collection, event, iconName }) => {
  return (
    <Link
      to={collection.getUrl()}
      bg={color("bg-medium")}
      color={color("text-medium")}
      className="block rounded relative text-brand-hover"
      data-metabase-event={event}
      hover={{ color: color("brand") }}
    >
      <Card hoverable>
        <Flex align="center" py={1} px={1} key={`collection-${collection.id}`}>
          <Flex
            align="center"
            justify="center"
            w="42px"
            bg={color("bg-dark")}
            style={{ height: 42, borderRadius: 6, flexShrink: 0 }}
            mr={1}
          >
            <Icon name={iconName} color={color("white")} />
          </Flex>
          <h4 className="overflow-hidden">
            <Ellipsified>{collection.name}</Ellipsified>
          </h4>
        </Flex>
      </Card>
    </Link>
  );
};

CollectionItem.propTypes = propTypes;

CollectionItem.defaultProps = {
  iconName: "folder",
};

export default CollectionItem;
