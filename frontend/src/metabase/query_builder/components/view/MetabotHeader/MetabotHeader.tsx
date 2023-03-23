import React from "react";
import { t } from "ttag";
import {
  GreetingSection,
  MetabotIcon,
  MetabotMessage,
} from "./MetabotHeader.styled";

const MetabotHeader = () => {
  return (
    <GreetingSection>
      <MetabotIcon />
      <MetabotMessage>{t`What can I answer for you?`}</MetabotMessage>
    </GreetingSection>
  );
};

export default MetabotHeader;
