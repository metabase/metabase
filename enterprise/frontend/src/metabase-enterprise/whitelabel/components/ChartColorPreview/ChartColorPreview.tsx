import React from "react";
import { t } from "ttag";
import { getHarmonyColors } from "metabase/lib/colors/groups";
import ChartColorSketch from "../ChartColorSketch";
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
        <ChartColorSketch colors={getHarmonyColors()} />
      </TableBody>
    </TableRoot>
  );
};

export default ChartColorPreview;
