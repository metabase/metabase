import React from "react";
import styled from "@emotion/styled";

import { PRODUCTS, metadata } from "__support__/sample_database_fixture";
import Dimension from "metabase-lib/lib/Dimension";

import DimensionSemanticTypeLabel from "./DimensionSemanticTypeLabel";

const fieldDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY.id, null],
  metadata,
);

const BiggerDimensionSemanticTypeLabel = styled(DimensionSemanticTypeLabel)`
  font-size: 32px;
`;

export const component = DimensionSemanticTypeLabel;
export const description = "A label for instances of Dimension";
export const examples = {
  DimensionSemanticTypeLabel: (
    <DimensionSemanticTypeLabel dimension={fieldDimension} />
  ),
  "Bigger DimensionSemanticTypeLabel": (
    <BiggerDimensionSemanticTypeLabel dimension={fieldDimension} />
  ),
};
