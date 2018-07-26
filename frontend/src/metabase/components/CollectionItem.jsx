import React from "react";
import { Flex } from "grid-styled";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import colors from "metabase/lib/colors";

const CollectionItem = ({
  collection,
  color,
  iconName = "all",
  highlighted,
  hovered,
  event,
}) => (
  <Link
    to={`collection/${collection.id}`}
    bg={
      hovered
        ? colors["brand"]
        : highlighted ? colors["bg-light"] : colors["bg-medium"]
    }
    color={hovered ? "white" : colors["text-medium"]}
    className="block rounded relative text-brand-hover"
    data-metabase-event={event}
    style={{
      borderSize: 1,
      borderColor: hovered
        ? colors["brand"]
        : highlighted ? colors["bg-medium"] : "transparent",
      borderStyle: hovered ? "solid" : highlighted ? "dotted" : "solid",
    }}
    p={[1, 2]}
  >
    <Flex align="center" py={1} key={`collection-${collection.id}`}>
      <Icon name={iconName} mx={1} />
      <h4 className="overflow-hidden">
        <Ellipsified>{collection.name}</Ellipsified>
      </h4>
    </Flex>
  </Link>
);

export default CollectionItem;
