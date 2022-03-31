import React, { useMemo } from "react";
import { sayHello } from "metabase/lib/greeting";
import { User } from "metabase-types/api";
import {
  GreetingLogo,
  GreetingMessage,
  GreetingRoot,
} from "./HomeGreeting.styled";

export interface HomeGreetingProps {
  user: User;
  showLogo?: boolean;
}

const HomeGreeting = ({
  user: { first_name },
  showLogo,
}: HomeGreetingProps): JSX.Element => {
  const message = useMemo(() => sayHello(first_name), [first_name]);

  return (
    <GreetingRoot>
      {showLogo && <GreetingLogo />}
      <GreetingMessage showLogo={showLogo}>{message}</GreetingMessage>
    </GreetingRoot>
  );
};

export default HomeGreeting;
