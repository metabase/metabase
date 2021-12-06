import React from "react";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";

import { getDatasetMetadataCompletenessPercentage } from "metabase/lib/data-modeling/metadata";

import {
  Root,
  PercentageLabel,
  MetadataProgressBar,
  TooltipContent,
  TooltipParagraph,
} from "./DatasetMetadataStrengthIndicator.styled";

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
  dataset: {
    getResultMetadata: () => FieldMetadata[];
  };
};

const TOOLTIP_DELAY: [number, null] = [700, null];

function DatasetMetadataStrengthIndicator({ dataset, ...props }: Props) {
  const resultMetadata = dataset.getResultMetadata();

  if (!Array.isArray(resultMetadata) || resultMetadata.length === 0) {
    return null;
  }

  const percentage = getDatasetMetadataCompletenessPercentage(resultMetadata);

  return (
    <Root {...props} percentage={percentage}>
      <Tooltip
        tooltip={getTooltipMessage(percentage)}
        delay={TOOLTIP_DELAY}
        placement="bottom"
      >
        <PercentageLabel>{formatPercentage(percentage)}</PercentageLabel>
        <MetadataProgressBar percentage={percentage} height="8px" />
      </Tooltip>
    </Root>
  );
}

export default DatasetMetadataStrengthIndicator;
