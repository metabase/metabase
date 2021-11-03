import React from "react";

import { PRODUCTS, metadata } from "__support__/sample_dataset_fixture";
import Dimension from "metabase-lib/lib/Dimension";
import Card from "metabase/components/Card";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Button from "metabase/components/Button";

import DimensionInfo from "./DimensionInfo";

const fieldDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY.id, null],
  metadata,
);

const expressionDimension = Dimension.parseMBQL(
  [
    "expression",
    Array(15)
      .fill("Long display name")
      .join(" -- "),
  ],
  metadata,
);

export const component = DimensionInfo;
export const description =
  "A selection of information from a given Dimension instance, for use in some containing component";
export const examples = {
  "with description": <DimensionInfo dimension={fieldDimension} />,
  "without description": <DimensionInfo dimension={expressionDimension} />,
  "in a card": (
    <Card>
      <DimensionInfo dimension={fieldDimension} />
    </Card>
  ),
  "in a popoover": (
    <PopoverWithTrigger triggerElement={<Button>click me</Button>}>
      <DimensionInfo dimension={fieldDimension} />
    </PopoverWithTrigger>
  ),
};
