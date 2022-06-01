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
  const colors = [...getHarmonyColors()].reverse();

  return (
    <TableRoot>
      <TableHeader>
        <TableTitle>{t`Palette preview`}</TableTitle>
      </TableHeader>
      <TableBody>
        <ChartColorSketch colors={colors} />
      </TableBody>
    </TableRoot>
  );
};

export default ChartColorPreview;
