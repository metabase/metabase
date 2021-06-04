import React from "react";
import BaseItemsTable from "./BaseItemsTable";

function PinnedItemsTable(props) {
  return <BaseItemsTable {...props} isPinned />;
}

export default PinnedItemsTable;
