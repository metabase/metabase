import React, { useMemo } from "react";
import { t } from "ttag";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import ChartColorSample from "../ChartColorSample";
import { getAccents } from "./utils";
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
  const colorValues = useDebouncedValue(colorPalette, PREVIEW_TIMEOUT);
  const colorAccents = useMemo(() => getAccents(colorValues), [colorValues]);

  return (
    <TableRoot>
      <TableHeader>
        <TableTitle>{t`Palette preview`}</TableTitle>
      </TableHeader>
      <TableBody>
        <ChartColorSample colors={colorAccents} />
      </TableBody>
    </TableRoot>
  );
};

export default ChartColorPreview;
