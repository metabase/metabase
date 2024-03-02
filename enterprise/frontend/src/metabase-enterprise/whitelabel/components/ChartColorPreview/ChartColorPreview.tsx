import { useMemo } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";

import ChartColorSample from "../ChartColorSample";

import {
  TableBody,
  TableHeader,
  TableRoot,
  TableTitle,
} from "./ChartColorPreview.styled";
import { getAccentColorGroups } from "./utils";

const PREVIEW_TIMEOUT = 400;

export interface ChartColorPreviewProps {
  colorPalette: Record<string, string>;
}

const ChartColorPreview = ({
  colorPalette,
}: ChartColorPreviewProps): JSX.Element => {
  const changedColors = useDebouncedValue(colorPalette, PREVIEW_TIMEOUT);

  const colorGroups = useMemo(() => {
    return getAccentColorGroups(changedColors);
  }, [changedColors]);

  return (
    <TableRoot>
      <TableHeader>
        <TableTitle>{t`Palette preview`}</TableTitle>
      </TableHeader>
      <TableBody>
        <ChartColorSample colorGroups={colorGroups} />
      </TableBody>
    </TableRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartColorPreview;
