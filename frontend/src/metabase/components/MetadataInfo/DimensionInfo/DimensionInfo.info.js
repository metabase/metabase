import React from "react";

import {
  PRODUCTS,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";
import Dimension from "metabase-lib/lib/Dimension";
import Card from "metabase/components/Card";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Button from "metabase/core/components/Button";

import DimensionInfo from "./DimensionInfo";

const fieldDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY.id, null],
  metadata,
);
fieldDimension.field().fingerprint = {
  global: {
    "distinct-count": 5,
  },
};

const numberDimension = Dimension.parseMBQL(
  ["field", ORDERS.TOTAL.id, null],
  metadata,
);
numberDimension.field().fingerprint = {
  type: {
    "type/Number": {
      avg: 3.5,
      min: 2,
      max: 5,
    },
  },
};

const dateDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CREATED_AT.id, null],
  metadata,
);
dateDimension.field().table = {
  database: {
    timezone: "America/Los_Angeles",
  },
};
dateDimension.field().fingerprint = {
  type: {
    "type/DateTime": {
      earliest: "2021-11-09T04:43:33.667Z",
      latest: "2021-12-09T04:43:33.667Z",
    },
  },
};

const expressionDimension = Dimension.parseMBQL(
  ["expression", Array(15).fill("Long display name").join(" -- ")],
  metadata,
);

const longDescriptionDimension = {
  displayName: () => "Foo",
  icon: () => "string",
  field: () => ({
    description: Array(50)
      .fill("Long description Long description")
      .join("\n "),
  }),
};

export const component = DimensionInfo;
export const description =
  "A selection of information from a given Dimension instance, for use in some containing component";
export const examples = {
  "with description": <DimensionInfo dimension={fieldDimension} />,
  "without description": <DimensionInfo dimension={expressionDimension} />,
  "long description": <DimensionInfo dimension={longDescriptionDimension} />,
  "in a card": (
    <Card>
      <DimensionInfo dimension={fieldDimension} />
    </Card>
  ),
  "in a popoover": (
    <PopoverWithTrigger triggerElement={<Button>click me</Button>}>
      <DimensionInfo dimension={longDescriptionDimension} />
    </PopoverWithTrigger>
  ),
  "with number fingerprint": (
    <Card>
      <DimensionInfo dimension={numberDimension} />
    </Card>
  ),
  "with date fingerprint": (
    <Card>
      <DimensionInfo dimension={dateDimension} />
    </Card>
  ),
};
