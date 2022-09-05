import React from "react";
import { t } from "ttag";

import Question from "metabase-lib/lib/Question";

import ProgressBar from "metabase/components/ProgressBar";
import Tooltip from "metabase/components/Tooltip";

import { color } from "metabase/lib/colors";
import { getDatasetMetadataCompletenessPercentage } from "metabase/lib/data-modeling/metadata";
import { useHover } from "metabase/hooks/use-hover";

import {
  Root,
  PercentageLabel,
  TooltipContent,
  TooltipParagraph,
} from "./DatasetMetadataStrengthIndicator.styled";

function getIndicationColor(percentage: number, isHovered: boolean): string {
  if (percentage <= 0.5) {
    return color("danger");
  }
  if (!isHovered) {
    return color("text-medium");
  }
  return percentage >= 0.9 ? color("success") : color("warning");
}

function getTooltipMessage(percentage: number) {
  if (percentage === 1) {
    return t`Every column has a type, a description, and a friendly name. Nice!`;
  }

  const columnCountDescription =
    percentage <= 0.5 ? t`Most` : percentage >= 0.8 ? t`Some` : t`Many`;

  return (
    <TooltipContent>
      <TooltipParagraph>
        {t`${columnCountDescription} columns are missing a column type, description, or friendly name.`}
      </TooltipParagraph>
      <TooltipParagraph>
        {t`Adding metadata makes it easier for your team to explore this data.`}
      </TooltipParagraph>
    </TooltipContent>
  );
}

function formatPercentage(percentage: number): string {
  return (percentage * 100).toFixed() + "%";
}

type Props = {
  dataset: Question;
};

const TOOLTIP_DELAY: [number, null] = [700, null];

function DatasetMetadataStrengthIndicator({ dataset, ...props }: Props) {
  const [hoverRef, isHovered] = useHover<HTMLDivElement>();
  const resultMetadata = dataset.getResultMetadata();

  if (!Array.isArray(resultMetadata) || resultMetadata.length === 0) {
    return null;
  }

  const percentage = getDatasetMetadataCompletenessPercentage(resultMetadata);
  const indicationColor = getIndicationColor(percentage, isHovered);

  return (
    <Root {...props} ref={hoverRef}>
      <Tooltip
        tooltip={getTooltipMessage(percentage)}
        delay={TOOLTIP_DELAY}
        placement="bottom"
      >
        <PercentageLabel
          color={indicationColor}
          data-testid="tooltip-component-wrapper"
        >
          {formatPercentage(percentage)}
        </PercentageLabel>
      </Tooltip>
    </Root>
  );
}

export default Object.assign(DatasetMetadataStrengthIndicator, { Root });
