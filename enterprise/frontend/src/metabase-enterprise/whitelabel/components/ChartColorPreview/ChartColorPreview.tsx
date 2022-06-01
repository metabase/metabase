import React, { useMemo } from "react";
import { t } from "ttag";
import { getAccentColors } from "metabase/lib/colors/groups";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import ChartColorSample from "../ChartColorSample";
import {
  TableBody,
  TableHeader,
  TableRoot,
  TableTitle,
} from "./ChartColorPreview.styled";

const PREVIEW_TIMEOUT = 400;

export interface ChartColorPreviewProps {
  colorPalette: Record<string, string>;
}

const ChartColorPreview = ({
  colorPalette,
}: ChartColorPreviewProps): JSX.Element => {
  const colors = useDebouncedValue(colorPalette, PREVIEW_TIMEOUT);

  const accents = useMemo(
    () => getAccentColors({ palette: colors, harmony: true }),
    [colors],
  );

  return (
    <TableRoot>
      <TableHeader>
        <TableTitle>{t`Palette preview`}</TableTitle>
      </TableHeader>
      <TableBody>
        <ChartColorSample colors={accents} />
      </TableBody>
    </TableRoot>
  );
};

export default ChartColorPreview;
