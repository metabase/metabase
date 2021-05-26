/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { color } from "metabase/lib/colors";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import BaseItemsTable from "./BaseItemsTable";

function PinnedItemsTable(props) {
  const getLinkProps = useCallback(
    item => ({
      className: "hover-parent hover--visibility",
      hover: { color: color("brand") },
      "data-metabase-event": `${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`,
    }),
    [],
  );

  return <BaseItemsTable {...props} pinned getLinkProps={getLinkProps} />;
}

export default PinnedItemsTable;
