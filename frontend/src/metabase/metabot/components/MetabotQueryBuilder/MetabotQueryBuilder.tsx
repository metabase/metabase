import React from "react";
import { Dataset } from "metabase-types/types/Dataset";
import Question from "metabase-lib/Question";
import MetabotVisualization from "../MetabotVisualization";
import MetabotQueryEditor from "../MetabotQueryEditor/MetabotQueryEditor";
import {
  MetabotQueryBuilderRoot,
  MetabotQueryVisualizationContainer,
} from "./MetabotQueryBuilder.styled";

type MetabotQueryBuilderProps = {
  question: Question;
  results: [Dataset];
  height: number;
};

const MetabotQueryBuilder = ({
  question,
  results,
  height,
}: MetabotQueryBuilderProps) => {
  return (
    <MetabotQueryBuilderRoot>
      <MetabotQueryEditor question={question} />
      <MetabotQueryVisualizationContainer>
        <MetabotVisualization question={question} results={results} />
      </MetabotQueryVisualizationContainer>
    </MetabotQueryBuilderRoot>
  );
};

export default MetabotQueryBuilder;
