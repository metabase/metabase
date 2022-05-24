import React from "react";
import { t } from "ttag";
import {
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
} from "./BrandColorTable.styled";

export interface BrandColorTableProps {
  colors: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

const BrandColorTable = ({ colors }: BrandColorTableProps): JSX.Element => {
  return (
    <div>
      <TableHeader>
        <TableHeaderRow>
          <TableHeaderCell>{t`Color`}</TableHeaderCell>
          <TableHeaderCell>{t`Where it's used`}</TableHeaderCell>
        </TableHeaderRow>
      </TableHeader>
    </div>
  );
};

export default BrandColorTable;
