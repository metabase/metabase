import React from "react";
import { t } from "ttag";
import {
  TableBody,
  TableBodyCell,
  TableBodyRow,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
  TableRoot,
} from "./BrandColorTable.styled";

const COLORS = [
  {
    name: "brand",
    description: t`The main color used throughout the app for buttons, links, and the default chart color.`,
  },
  {
    name: "accent1",
    description: t`The color of aggregations and breakouts in the graphical query builder.`,
  },
  {
    name: "accent7",
    description: t`Color of filters in the query builder, buttons and links in filter widgets.`,
  },
];

export interface BrandColorTableProps {
  values?: Record<string, string>;
  onChange?: (values: Record<string, string>) => void;
}

const BrandColorTable = ({ values }: BrandColorTableProps): JSX.Element => {
  return (
    <TableRoot>
      <TableHeader>
        <TableHeaderRow>
          <TableHeaderCell>{t`Color`}</TableHeaderCell>
          <TableHeaderCell>{t`Where it's used`}</TableHeaderCell>
        </TableHeaderRow>
      </TableHeader>
      <TableBody>
        {COLORS.map(({ name, description }, index) => (
          <TableBodyRow key={index}>
            <TableBodyCell>{name}</TableBodyCell>
            <TableBodyCell>{description}</TableBodyCell>
          </TableBodyRow>
        ))}
      </TableBody>
    </TableRoot>
  );
};

export default BrandColorTable;
