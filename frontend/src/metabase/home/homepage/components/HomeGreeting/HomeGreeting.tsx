import React, { useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import Tooltip from "metabase/components/Tooltip";
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
      {showLogo && (
        <Tooltip
          tooltip={t`Don't tell anyone, but you're my favorite.`}
          placement="bottom"
        >
          <GreetingLogo />
        </Tooltip>
      )}
      <GreetingMessage showLogo={showLogo}>{message}</GreetingMessage>
    </GreetingRoot>
  );
};

const getMessage = (name: string): string => {
  // XXX: This must be the only place that we don't wanna fallback to a user email.
  // https://user-images.githubusercontent.com/1937582/172602322-022bd4bc-4d15-4cf7-a9dd-0b457775be76.png
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
