import React from "react";
import { t } from "ttag";
import {
  TableCell,
  TableHeader,
  TableHeaderText,
  TableRow,
} from "./BrandColorTable.styled";

export interface BrandColorTableProps {
  colors: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

const BrandColorTable = ({ colors }: BrandColorTableProps): JSX.Element => {
  return (
    <div>
      <TableHeader>
        <TableRow>
          <TableCell>
            <TableHeaderText>{t`Color`}</TableHeaderText>
          </TableCell>
          <TableCell>
            <TableHeaderText>{t`Where it's used`}</TableHeaderText>
          </TableCell>
        </TableRow>
      </TableHeader>
    </div>
  );
};

export default BrandColorTable;
