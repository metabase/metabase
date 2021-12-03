import React from "react";
import { t } from "ttag";

// eslint-disable-next-line import/namespace, import/default, import/no-named-as-default, import/no-named-as-default-member
import Question from "metabase-lib/lib/Question";

import ProgressBar from "metabase/components/ProgressBar";
import Tooltip from "metabase/components/Tooltip";

import { color } from "metabase/lib/colors";
import { getDatasetMetadataCompletenessPercentage } from "metabase/lib/data-modeling/metadata";

import {
  Root,
  PercentageLabel,
  TooltipContent,
  TooltipParagraph,
} from "./DatasetMetadataStrengthIndicator.styled";

function getIndicatorColor(percentage: number): string {
  if (percentage <= 0.5) {
    return color("danger");
  }
  return percentage >= 0.9 ? color("success") : color("warning");
}

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
  const indicationColor = getIndicatorColor(percentage);

  return (
    <Root>
      <Tooltip
        tooltip={getTooltipMessage(percentage)}
        delay={TOOLTIP_DELAY}
        placement="bottom"
      >
        <PercentageLabel color={indicationColor}>
          {formatPercentage(percentage)}
        </PercentageLabel>
        <ProgressBar
          percentage={percentage}
          color={indicationColor}
          height="6px"
        />
      </Tooltip>
    </Root>
  );
}

export default DatasetMetadataStrengthIndicator;
