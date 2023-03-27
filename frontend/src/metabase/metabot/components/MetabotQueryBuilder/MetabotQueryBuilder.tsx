import React, { useState } from "react";
import { Dataset } from "metabase-types/api";
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
  question,
  results,
}: MetabotQueryBuilderProps) => {
  const [isShowingRawTable, setIsShowingRawTable] = useState(false);

  return (
    <MetabotQueryBuilderRoot>
      <MetabotQueryEditor question={question} />
      <MetabotQueryVisualizationContainer>
        <MetabotVisualization
          question={question}
          results={results}
          isShowingRawTable={isShowingRawTable}
        />
      </MetabotQueryVisualizationContainer>
      <MetabotQueryFooter
        question={question}
        isShowingRawTable={isShowingRawTable}
        onToggleRawTable={setIsShowingRawTable}
      />
    </MetabotQueryBuilderRoot>
  );
};

export default MetabotQueryBuilder;
