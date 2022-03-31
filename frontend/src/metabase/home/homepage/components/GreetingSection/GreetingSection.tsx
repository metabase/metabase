import React, { useMemo } from "react";
import MetabotLogo from "metabase/components/MetabotLogo";
import { SectionMessage, SectionRoot } from "./GreetingSection.styled";
import { User } from "metabase-types/api";
import { sayHello } from "metabase/lib/greeting";

export interface GreetingSectionProps {
  user: User;
  showLogo?: boolean;
}

const GreetingSection = ({
  user: { first_name },
  showLogo,
}: GreetingSectionProps): JSX.Element => {
  const message = useMemo(() => sayHello(first_name), [first_name]);

  return (
    <SectionRoot>
      {showLogo && <MetabotLogo />}
      <SectionMessage showLogo={showLogo}>{message}</SectionMessage>
    </SectionRoot>
  );
};

export default GreetingSection;
