import React, { useMemo } from "react";
import { t } from "ttag";
import MetabotLogo from "metabase/components/MetabotLogo";
import Tooltip from "metabase/components/Tooltip";
import Greeting from "metabase/lib/greeting";
import { User } from "../../types";
import Section from "../Section";
import { GreetingContent, GreetingTitle } from "./GreetingSection.styled";

interface Props {
  user: User;
}

const GreetingSection = ({ user: { first_name } }: Props) => {
  const greeting = useMemo(() => Greeting.sayHello(first_name), [first_name]);

  return (
    <Section>
      <GreetingContent>
        <Tooltip
          tooltip={t`Don't tell anyone, but you're my favorite.`}
          placement="bottom"
        >
          <MetabotLogo />
        </Tooltip>
        <GreetingTitle>{greeting}</GreetingTitle>
      </GreetingContent>
    </Section>
  );
};

export default GreetingSection;
