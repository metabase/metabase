import React, { useMemo } from "react";
import MetabotMode from "metabase/modes/components/modes/MetabotMode";
import { Dataset } from "metabase-types/types/Dataset";
import Question from "metabase-lib/Question";
import { FullVisualization } from "./MetabotVisualization.styled";

interface MetabotVisualizationProps {
  question: Question;
  results: [Dataset];
  isRawTable: boolean;
}

const MetabotVisualization = ({
  question,
  results,
  isRawTable,
}: MetabotVisualizationProps) => {
  const rawSeries = useMemo(
    () => getRawSeries(question, results, isRawTable),
    [question, results, isRawTable],
  );

  return (
    <FullVisualization
      mode={MetabotMode}
      rawSeries={rawSeries}
      error={getError(results)}
      metadata={question.metadata()}
    />
  );
};

const getRawSeries = (
  question: Question,
  [result]: [Dataset],
  isRawData: boolean,
) => {
  const card = isRawData
    ? question.setDisplay("table").setSettings({ "table.pivot": false }).card()
    : question.card();

  return [{ card, data: result && result.data }];
};

const getError = ([result]: [Dataset]) => {
  return result && result.error;
};

export default MetabotVisualization;
