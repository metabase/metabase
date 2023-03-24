import React from "react";
import RawTableToggle from "metabase/query_builder/components/view/RawTableToggle";
import Question from "metabase-lib/Question";
import {
  QueryFooterButtonbar,
  QueryFooterRoot,
} from "./MetabotQueryFooter.styled";

export interface MetabotQueryFooterProps {
  question: Question;
}

const MetabotQueryFooter = ({ question }: MetabotQueryFooterProps) => {
  return (
    <QueryFooterRoot>
      <QueryFooterButtonbar
        center={
          <RawTableToggle question={question} isShowingRawTable={false} />
        }
      />
    </QueryFooterRoot>
  );
};

export default MetabotQueryFooter;
