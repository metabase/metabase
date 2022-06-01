import React, { useMemo } from "react";
import { t } from "ttag";
import { getAccentColors } from "metabase/lib/colors/groups";
import ChartColorSample from "../ChartColorSample";
import {
  TableBody,
  TableHeader,
  TableRoot,
  TableTitle,
} from "./ChartColorPreview.styled";

export interface ChartColorPreviewProps {
  colorPalette: Record<string, string>;
}

const ChartColorPreview = ({
  colorPalette,
}: ChartColorPreviewProps): JSX.Element => {
  const colors = useMemo(
    () => getAccentColors({ palette: colorPalette, harmony: true }),
    [colorPalette],
  );

  return (
    <TableRoot>
      <TableHeader>
        <TableTitle>{t`Palette preview`}</TableTitle>
      </TableHeader>
      <TableBody>
        <ChartColorSample colors={colors} />
      </TableBody>
    </TableRoot>
  );
};

export default ChartColorPreview;
