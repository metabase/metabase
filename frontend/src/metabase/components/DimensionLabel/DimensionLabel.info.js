import React from "react";

import { PRODUCTS, metadata } from "__support__/sample_dataset_fixture";
import Dimension from "metabase-lib/lib/Dimension";

import DimensionLabel from "./DimensionLabel";

const fieldDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY.id, null],
  metadata,
);

export const component = DimensionLabel;
export const description = "A label for instances of Dimension";
export const examples = {
  "field dimension": <DimensionLabel dimension={fieldDimension} />,
};
