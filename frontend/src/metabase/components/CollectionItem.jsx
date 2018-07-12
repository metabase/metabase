import React from "react";
import { Flex } from "grid-styled";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import colors, { normal } from "metabase/lib/colors";

const CollectionItem = ({ collection, color, iconName = "all" }) => (
  <Link
    to={`collection/${collection.id}`}
    bg={colors["bg-medium"]}
    className="block rounded relative text-brand-hover text-medium"
    hover={{
      backgroundColor: colors["bg-medium"],
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
