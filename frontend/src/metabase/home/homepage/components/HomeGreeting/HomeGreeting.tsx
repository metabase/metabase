import React, { useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
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
  const message = useMemo(() => getMessage(first_name), [first_name]);

  return (
    <GreetingRoot>
      {showLogo && <GreetingLogo />}
      <GreetingMessage showLogo={showLogo}>{message}</GreetingMessage>
    </GreetingRoot>
  );
};

const getMessage = (name: string): string => {
  const options = [
    t`Hey there, ${name}`,
    t`How's it going, ${name}?`,
    t`Howdy, ${name}`,
    t`Greetings, ${name}`,
    t`Good to see you, ${name}`,
  ];

  return _.sample(options) ?? "";
};

export default HomeGreeting;
