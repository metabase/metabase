import React from "react";
import { Dataset } from "metabase-types/api";
import Question from "metabase-lib/Question";
import MetabotQueryEditor from "../MetabotQueryEditor";
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
  question,
  results,
}: MetabotQueryBuilderProps) => {
  return (
    <MetabotQueryBuilderRoot>
      <MetabotQueryEditor question={question} isReadOnly hasTopbar />
      <MetabotQueryVisualizationContainer>
        <MetabotVisualization question={question} results={results} />
      </MetabotQueryVisualizationContainer>
    </MetabotQueryBuilderRoot>
  );
};

export default MetabotQueryBuilder;
