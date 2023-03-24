import React from "react";
import QuestionTableToggle from "metabase/query_builder/components/view/QuestionTableToggle";
import Question from "metabase-lib/Question";
import {
  QueryFooterButtonbar,
  QueryFooterRoot,
} from "./MetabotQueryFooter.styled";

export interface MetabotQueryFooterProps {
  question: Question;
  isRawTable: boolean;
  onToggleRawTable: (isRawTable: boolean) => void;
}

const MetabotQueryFooter = ({
  question,
  isRawTable,
  onToggleRawTable,
}: MetabotQueryFooterProps) => {
  const isVisualized = isQuestionVisualized(question);

  return (
    <QueryFooterRoot>
      <QueryFooterButtonbar
        center={
          isVisualized && (
            <QuestionTableToggle
              question={question}
              isRawTable={isRawTable}
              onToggleRawTable={onToggleRawTable}
            />
          )
        }
      />
    </QueryFooterRoot>
  );
};

const isQuestionVisualized = (question: Question) => {
  return question.display() === "table" || question.display() === "pivot";
};

export default MetabotQueryFooter;
