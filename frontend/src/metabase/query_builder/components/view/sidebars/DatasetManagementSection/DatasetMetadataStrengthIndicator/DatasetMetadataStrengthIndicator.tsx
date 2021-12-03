import React from "react";
import { t } from "ttag";

// eslint-disable-next-line import/namespace, import/default, import/no-named-as-default, import/no-named-as-default-member
import Question from "metabase-lib/lib/Question";

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
    percentage <= 0.5 ? t`Most` : percentage >= 0.9 ? t`Some` : t`Many`;

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

const TOOLTIP_DELAY: [number, null] = [500, null];

function DatasetMetadataStrengthIndicator({ dataset }: Props) {
  const resultMetadata = dataset.getResultMetadata();

  if (resultMetadata?.length === 0) {
    return null;
  }

  const percentage = getDatasetMetadataCompletenessPercentage(resultMetadata);

  return (
    <Root percentage={percentage}>
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
