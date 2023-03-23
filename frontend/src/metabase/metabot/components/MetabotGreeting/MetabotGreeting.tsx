import React, { ReactNode } from "react";
import {
  GreetingMessage,
  GreetingMetabotLogo,
  GreetingRoot,
} from "./MetabotGreeting.styled";

interface MetabotGreetingProps {
  children?: ReactNode;
}

const MetabotGreeting = ({ children }: MetabotGreetingProps) => {
  return (
    <GreetingRoot>
      <GreetingMetabotLogo />
      <GreetingMessage>{children}</GreetingMessage>
    </GreetingRoot>
  );
};

export default MetabotGreeting;
