import React from "react";
import styled from "styled-components";

import { PRODUCTS, metadata } from "__support__/sample_dataset_fixture";
import Dimension from "metabase-lib/lib/Dimension";

import DimensionLabel from "./DimensionLabel";

const fieldDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY.id, null],
  metadata,
);

const BiggerDimensionLabel = styled(DimensionLabel)`
  font-size: 32px;
`;

export const component = DimensionLabel;
export const description = "A label for instances of Dimension";
export const examples = {
  DimensionLabel: <DimensionLabel dimension={fieldDimension} />,
  "Bigger DimensionLabel": <BiggerDimensionLabel dimension={fieldDimension} />,
};
