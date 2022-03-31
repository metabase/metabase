import React from "react";
import MetabotLogo from "metabase/components/MetabotLogo";
import { SectionMessage, SectionRoot } from "./GreetingSection.styled";

export interface GreetingSectionProps {
  showLogo?: boolean;
}

const GreetingSection = ({ showLogo }: GreetingSectionProps): JSX.Element => {
  return (
    <SectionRoot>
      {showLogo && <MetabotLogo />}
      <SectionMessage />
    </SectionRoot>
  );
};

export default GreetingSection;
