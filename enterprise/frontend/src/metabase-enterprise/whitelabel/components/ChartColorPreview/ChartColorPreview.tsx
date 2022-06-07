import React, { useMemo } from "react";
import { t } from "ttag";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import ChartColorSample from "../ChartColorSample";
import { getAccentColors } from "./utils";
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
  const changedColors = useDebouncedValue(colorPalette, PREVIEW_TIMEOUT);

  const accentColors = useMemo(() => {
    return getAccentColors(changedColors);
  }, [changedColors]);

  return (
    <TableRoot>
      <TableHeader>
        <TableTitle>{t`Palette preview`}</TableTitle>
      </TableHeader>
      <TableBody>
        <ChartColorSample colors={accentColors} />
      </TableBody>
    </TableRoot>
  );
};

export default ChartColorPreview;
