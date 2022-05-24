import React from "react";
import { t } from "ttag";
import {
  TableHeader,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "./BrandColorTable.styled";

export interface BrandColorTableProps {
  colors: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

const BrandColorTable = ({ colors }: BrandColorTableProps): JSX.Element => {
  return (
    <TableRoot>
      <TableHeader>
        <TableRow>
          <TableHeaderCell>{t`Color`}</TableHeaderCell>
          <TableHeaderCell>{t`Where it's used`}</TableHeaderCell>
        </TableRow>
      </TableHeader>
    </TableRoot>
  );
};

export default BrandColorTable;
