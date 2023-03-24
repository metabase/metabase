import React, { useState } from "react";
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
  question,
  results,
}: MetabotQueryBuilderProps) => {
  const [isRawTable, setIsRawTable] = useState(false);

  return (
    <MetabotQueryBuilderRoot>
      <MetabotQueryEditor question={question} />
      <MetabotQueryVisualizationContainer>
        <MetabotVisualization
          question={question}
          results={results}
          isRawTable={isRawTable}
        />
      </MetabotQueryVisualizationContainer>
      <MetabotQueryFooter
        question={question}
        isRawTable={isRawTable}
        onToggleRawTable={setIsRawTable}
      />
    </MetabotQueryBuilderRoot>
  );
};

export default MetabotQueryBuilder;
