import React, { useMemo, useState } from "react";
import { Dataset } from "metabase-types/types/Dataset";
import Question from "metabase-lib/Question";
import MetabotQueryEditor from "../MetabotQueryEditor";
import MetabotQueryFooter from "../MetabotQueryFooter";
import MetabotVisualization from "../MetabotVisualization";
import {
  MetabotQueryBuilderRoot,
  MetabotQueryVisualizationContainer,
} from "./MetabotQueryBuilder.styled";

type MetabotQueryBuilderProps = {
  question: Question;
  results: [Dataset];
};

const MetabotQueryBuilder = ({
  question: initialQuestion,
  results,
}: MetabotQueryBuilderProps) => {
  const [isRawTable, setIsRawTable] = useState(false);
  const question = useMemo(
    () => getQuestion(initialQuestion, isRawTable),
    [initialQuestion, isRawTable],
  );

  return (
    <MetabotQueryBuilderRoot>
      <MetabotQueryEditor question={question} />
      <MetabotQueryVisualizationContainer>
        <MetabotVisualization question={question} results={results} />
      </MetabotQueryVisualizationContainer>
      <MetabotQueryFooter
        question={question}
        isRawTable={isRawTable}
        onToggleRawTable={setIsRawTable}
      />
    </MetabotQueryBuilderRoot>
  );
};

const getQuestion = (question: Question, isRawData: boolean) => {
  if (isRawData) {
    return question.setDisplay("table").setSettings({ "table.pivot": false });
  } else {
    return question;
  }
};

export default MetabotQueryBuilder;
