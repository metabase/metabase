import React from "react";
import { t } from "ttag";
import { TableHeader, TableRoot, TableTitle } from "./ChartColorPreview.styled";

const ChartColorPreview = (): JSX.Element => {
  return (
    <TableRoot>
      <TableHeader>
        <TableTitle>{t`Palette preview`}</TableTitle>
      </TableHeader>
    </TableRoot>
  );
};

export default ChartColorPreview;
