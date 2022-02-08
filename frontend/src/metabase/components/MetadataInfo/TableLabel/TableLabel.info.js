import React from "react";
import styled from "@emotion/styled";

import { PRODUCTS } from "__support__/sample_database_fixture";
import Table from "metabase-lib/lib/metadata/Table";

import TableLabel from "./TableLabel";

const table = new Table({
  ...PRODUCTS,
});
const BiggerTableLabel = styled(TableLabel)`
  font-size: 32px;
`;

export const component = TableLabel;
export const description = "A label for instances of Table";
export const examples = {
  TableLabel: <TableLabel table={table} />,
  "Bigger TableLabel": <BiggerTableLabel table={table} />,
};
