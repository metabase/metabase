import { useRef } from "react";
import { useHoverDirty } from "react-use";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import { getDatasetMetadataCompletenessPercentage } from "metabase-lib/v1/metadata/utils/models";

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
    <TooltipContent data-testid="tooltip-content">
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

const TOOLTIP_DELAY = 700;

function DatasetMetadataStrengthIndicator({ dataset, ...props }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isHovering = useHoverDirty(rootRef);
  const resultMetadata = dataset.getResultMetadata();

  if (!Array.isArray(resultMetadata) || resultMetadata.length === 0) {
    return null;
  }

  const percentage = getDatasetMetadataCompletenessPercentage(resultMetadata);
  const indicationColor = getIndicationColor(percentage, isHovering);

  return (
    <Root {...props} ref={rootRef}>
      <Tooltip
        label={getTooltipMessage(percentage)}
        openDelay={TOOLTIP_DELAY}
        position="bottom"
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(DatasetMetadataStrengthIndicator, { Root });
