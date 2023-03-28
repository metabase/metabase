import React from "react";
import MetabotMode from "metabase/modes/components/modes/MetabotMode";
import { Dataset } from "metabase-types/api";
import Question from "metabase-lib/Question";
import { FullVisualization } from "./MetabotVisualization.styled";

interface MetabotVisualizationProps {
  question: Question;
  results: [Dataset];
}

const MetabotVisualization = ({
  question,
  results: [result],
}: MetabotVisualizationProps) => {
  const card = question.card();

  return (
    <FullVisualization
      mode={MetabotMode}
      rawSeries={[{ card, data: result && result.data }]}
      error={result && result.error}
      metadata={question.metadata()}
    />
  );
};

export default MetabotVisualization;
