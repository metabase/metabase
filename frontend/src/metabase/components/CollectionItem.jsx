/* eslint-disable react/prop-types */
import React from "react";
import { Flex } from "grid-styled";

import Card from "metabase/components/Card";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { color } from "metabase/lib/colors";

const ItemLink = ({ collection, event, children }) => (
  <Link
    to={collection.getUrl()}
    bg={color("bg-medium")}
    color={color("text-medium")}
    className="block rounded relative text-brand-hover"
    data-metabase-event={event}
    hover={{ color: color("brand") }}
  >
    {children}
  </Link>
);

const ItemInfo = props => (
  <h4 className="overflow-hidden">
    <Ellipsified>{props.collection.name}</Ellipsified>
  </h4>
);

const CollectionItem = props => {
  return (
    <ItemLink {...props}>
      <Card hoverable>
        <Flex
          align="center"
          py={1}
          px={1}
          key={`collection-${props.collection.id}`}
        >
          <Flex
            align="center"
            justify="center"
            w="42px"
            bg={color("bg-dark")}
            style={{ height: 42, borderRadius: 6, flexShrink: 0 }}
            mr={1}
          >
            <Icon name={props.iconName} color={color("white")} />
          </Flex>
          <ItemInfo {...props} />
        </Flex>
      </Card>
    </ItemLink>
  );
};

CollectionItem.defaultProps = {
  iconName: "folder",
};

export default CollectionItem;
