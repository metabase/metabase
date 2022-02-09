import React from "react";
import { t } from "ttag";

import ViewSection, { ViewHeading } from "./ViewSection";

export default function NewQuestionHeader(props) {
  return (
    <ViewSection {...props}>
      <ViewHeading>{t`Pick your starting data`}</ViewHeading>
    </ViewSection>
  );
}
