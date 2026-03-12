import { useRef } from "react";
import { useHoverDirty } from "react-use";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import type { ColorName } from "metabase/lib/colors/types";
import { Box, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import { getDatasetMetadataCompletenessPercentage } from "metabase-lib/v1/metadata/utils/models";

import DatasetMetadataStrengthIndicatorS from "./DatasetMetadataStrengthIndicator.module.css";

function getIndicationColor(percentage: number, isHovered: boolean): ColorName {
  if (percentage <= 0.5) {
    return "danger";
  }
  if (!isHovered) {
    return "text-secondary";
  }
  return percentage >= 0.9 ? "success" : "warning";
}

function getTooltipMessage(percentage: number) {
  if (percentage === 1) {
    return t`Every column has a type, a description, and a friendly name. Nice!`;
  }

  const columnCountDescription =
    percentage <= 0.5 ? t`Most` : percentage >= 0.8 ? t`Some` : t`Many`;

  return (
    <Box
      className={DatasetMetadataStrengthIndicatorS.TooltipContent}
      data-testid="tooltip-content"
    >
      <Box
        component="p"
        className={DatasetMetadataStrengthIndicatorS.TooltipParagraph}
      >
        {t`${columnCountDescription} columns are missing a column type, description, or friendly name.`}
      </Box>
      <Box
        component="p"
        className={DatasetMetadataStrengthIndicatorS.TooltipParagraph}
      >
        {t`Adding metadata makes it easier for your team to explore this data.`}
      </Box>
    </Box>
  );
}

function formatPercentage(percentage: number): string {
  return (percentage * 100).toFixed() + "%";
}

type Props = {
  dataset: Question;
  className?: string;
};

const TOOLTIP_DELAY = 700;

export function DatasetMetadataStrengthIndicator({ dataset, ...props }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isHovering = useHoverDirty(rootRef);
  const resultMetadata = dataset.getResultMetadata();

  if (!Array.isArray(resultMetadata) || resultMetadata.length === 0) {
    return null;
  }

  const percentage = getDatasetMetadataCompletenessPercentage(resultMetadata);
  const indicationColor = getIndicationColor(percentage, isHovering);

  return (
    <Box
      display="inline-block"
      className={CS.floatRight}
      {...props}
      ref={rootRef}
    >
      <Tooltip
        label={getTooltipMessage(percentage)}
        openDelay={TOOLTIP_DELAY}
        position="bottom"
      >
        <Box
          component="span"
          fz="0.8rem"
          fw="bold"
          className={DatasetMetadataStrengthIndicatorS.PercentageLabel}
          c={indicationColor}
          data-testid="tooltip-component-wrapper"
        >
          {formatPercentage(percentage)}
        </Box>
      </Tooltip>
    </Box>
  );
}
