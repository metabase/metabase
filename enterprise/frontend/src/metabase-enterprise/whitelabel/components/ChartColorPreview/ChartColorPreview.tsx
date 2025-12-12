import { useMemo } from "react";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Box, Flex } from "metabase/ui";

import ChartColorSample from "../ChartColorSample";

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
    <Flex
      direction="column"
      bd="1px solid var(--mb-color-border)"
      bdrs="0.5rem"
      p="3rem 1.5rem"
    >
      <Box style={{ flex: "1 1 0" }} mih="24rem">
        <ChartColorSample colorGroups={colorGroups} />
      </Box>
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartColorPreview;
