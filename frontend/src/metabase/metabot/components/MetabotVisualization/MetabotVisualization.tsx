import React from "react";
import { connect } from "react-redux";
import { checkNotNull } from "metabase/core/utils/types";
import MetabotMode from "metabase/modes/components/modes/MetabotMode";
import { Dataset } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import { getQueryResults, getQuestion } from "../../selectors";
import { FullVisualization } from "./MetabotVisualization.styled";

interface StateProps {
  question: Question;
  queryResults: [Dataset];
}

type MetabotVisualizationProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  question: checkNotNull(getQuestion(state)),
  queryResults: checkNotNull(getQueryResults(state)),
});

const MetabotVisualization = ({
  question,
  queryResults: [result],
}: MetabotVisualizationProps) => {
  const card = question.card();

  return (
    <FullVisualization
      showTitle
      mode={MetabotMode}
      rawSeries={[{ card, data: result && result.data }]}
      error={result && result.error}
      metadata={question.metadata()}
    />
  );
};

export default connect(mapStateToProps)(MetabotVisualization);
