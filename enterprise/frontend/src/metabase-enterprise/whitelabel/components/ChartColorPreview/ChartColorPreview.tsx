import { useMemo } from "react";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";

import ChartColorSample from "../ChartColorSample";

import { TableBody, TableRoot } from "./ChartColorPreview.styled";
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
      <TableBody>
        <ChartColorSample colorGroups={colorGroups} />
      </TableBody>
    </TableRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartColorPreview;
