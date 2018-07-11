import React from "react";
import { Flex } from "grid-styled";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import colors, { normal } from "metabase/lib/colors";

const CollectionItem = ({ collection, color, iconName = "all" }) => (
  <Link
    to={`collection/${collection.id}`}
    color={normal.grey2}
    bg={colors["bg-light"]}
    className="block rounded"
    hover={{
      color: colors.primary,
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
