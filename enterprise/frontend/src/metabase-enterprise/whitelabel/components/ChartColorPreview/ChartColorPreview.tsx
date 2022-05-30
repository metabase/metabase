import React from "react";
import { t } from "ttag";
import {
  TableBody,
  TableHeader,
  TableRoot,
  TableTitle,
} from "./ChartColorPreview.styled";

const ChartColorPreview = (): JSX.Element => {
  return (
    <TableRoot>
      <TableHeader>
        <TableTitle>{t`Palette preview`}</TableTitle>
      </TableHeader>
      <TableBody />
    </TableRoot>
  );
};

export default ChartColorPreview;
