import React from "react";

// eslint-disable-next-line import/namespace, import/default, import/no-named-as-default, import/no-named-as-default-member
import Question from "metabase-lib/lib/Question";

import ProgressBar from "metabase/components/ProgressBar";

import { color } from "metabase/lib/colors";
import { getDatasetMetadataCompletenessPercentage } from "metabase/lib/data-modeling/metadata";

import {
  Root,
  PercentageLabel,
} from "./DatasetMetadataStrengthIndicator.styled";

function getIndicatorColor(percentage: number): string {
  if (percentage <= 0.5) {
    return color("danger");
  }
  return percentage >= 0.9 ? color("success") : color("warning");
}

function formatPercentage(percentage: number): string {
  return (percentage * 100).toFixed() + "%";
}

type Props = {
  dataset: Question;
};

function DatasetMetadataStrengthIndicator({ dataset }: Props) {
  const resultMetadata = dataset.getResultMetadata();

  if (resultMetadata?.length === 0) {
    return null;
  }

  const percentage = getDatasetMetadataCompletenessPercentage(resultMetadata);
  const indicationColor = getIndicatorColor(percentage);

  return (
    <Root>
      <PercentageLabel color={indicationColor}>
        {formatPercentage(percentage)}
      </PercentageLabel>
      <ProgressBar
        percentage={percentage}
        color={indicationColor}
        height="6px"
      />
    </Root>
  );
}

export default DatasetMetadataStrengthIndicator;
