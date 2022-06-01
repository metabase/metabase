import React from "react";
import { t } from "ttag";
import { getAccentColors } from "metabase/lib/colors/groups";
import ChartColorSample from "../ChartColorSample";
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
      <TableBody>
        <ChartColorSample colors={getAccentColors()} />
      </TableBody>
    </TableRoot>
  );
};

export default ChartColorPreview;
