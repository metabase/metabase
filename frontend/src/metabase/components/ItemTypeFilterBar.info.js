import React from "react";
import ItemTypeFilterBar from "metabase/components/ItemTypeFilterBar";

export const component = ItemTypeFilterBar;
export const description = `
  Applies a set of filters to the url to filter by common item types
`;
export const examples = {
  Default: <ItemTypeFilterBar />,
};
