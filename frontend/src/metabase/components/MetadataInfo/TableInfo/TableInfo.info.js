import React from "react";

import { PRODUCTS } from "__support__/sample_database_fixture";
import Card from "metabase/components/Card";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Button from "metabase/core/components/Button";
import Table from "metabase-lib/lib/metadata/Table";

import TableInfo from "./TableInfo";

const table = new Table(PRODUCTS);
const tableNoDescription = new Table({ id: 123, display_name: "Foo" });

export const component = TableInfo;
export const description =
  "A selection of information from a given Table instance, for use in some containing component";
export const examples = {
  "with description": <TableInfo table={table} />,
  "without description": <TableInfo table={tableNoDescription} />,
  "in a card": (
    <Card>
      <TableInfo table={table} />
    </Card>
  ),
  "in a popoover": (
    <PopoverWithTrigger triggerElement={<Button>click me</Button>}>
      <TableInfo table={table} />
    </PopoverWithTrigger>
  ),
};
