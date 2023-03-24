import React from "react";
import Question from "metabase-lib/Question";
import { QueryFooterRoot } from "./MetabotQueryFooter.styled";

export interface MetabotQueryFooterProps {
  question: Question;
}

const MetabotQueryFooter = ({ question }: MetabotQueryFooterProps) => {
  return <QueryFooterRoot />;
};

export default MetabotQueryFooter;
