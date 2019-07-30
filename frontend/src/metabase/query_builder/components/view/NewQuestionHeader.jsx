import React from "react";

import ViewSection, { ViewHeading } from "./ViewSection";

export default function NewQuestionHeader(props) {
  return (
    <ViewSection {...props}>
      <ViewHeading>{`Pick your starting data`}</ViewHeading>
    </ViewSection>
  );
}
