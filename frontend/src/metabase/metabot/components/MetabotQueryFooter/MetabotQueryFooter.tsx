import React from "react";
import QuestionTableToggle from "metabase/query_builder/components/view/QuestionTableToggle";
import Question from "metabase-lib/Question";
import {
  QueryFooterButtonbar,
  QueryFooterRoot,
} from "./MetabotQueryFooter.styled";

export interface MetabotQueryFooterProps {
  question: Question;
  isShowingRawTable: boolean;
  onToggleRawTable: (isShowingRawTable: boolean) => void;
}

const MetabotQueryFooter = ({
  question,
  isShowingRawTable,
  onToggleRawTable,
}: MetabotQueryFooterProps) => {
  return (
    <QueryFooterRoot>
      <QueryFooterButtonbar
        center={
          <QuestionTableToggle
            question={question}
            isShowingRawTable={isShowingRawTable}
            onToggleRawTable={onToggleRawTable}
          />
        }
      />
    </QueryFooterRoot>
  );
};

export default MetabotQueryFooter;
