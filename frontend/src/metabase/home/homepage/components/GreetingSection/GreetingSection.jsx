import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Greeting from "metabase/lib/greeting";
import MetabotLogo from "metabase/components/MetabotLogo";
import Tooltip from "metabase/components/Tooltip";
import Section from "../Section";
import { GreetingContent, GreetingTitle } from "./GreetingSection.styled";

const propTypes = {
  user: PropTypes.object.isRequired,
};

const GreetingSection = ({ user: { first_name } }) => {
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

GreetingSection.propTypes = propTypes;

export default GreetingSection;
