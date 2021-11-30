import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import MetabotLogo from "metabase/components/MetabotLogo";
import Tooltip from "metabase/components/Tooltip";
import LandingSection from "../LandingSection";
import { GreetingContent, GreetingTitle } from "./GreetingSection.styled";

const propTypes = {
  greeting: PropTypes.string.isRequired,
};

const GreetingSection = ({ greeting }) => {
  return (
    <LandingSection>
      <GreetingContent>
        <Tooltip
          tooltip={t`Don't tell anyone, but you're my favorite.`}
          placement="bottom"
        >
          <MetabotLogo />
        </Tooltip>
        <GreetingTitle>{greeting}</GreetingTitle>
      </GreetingContent>
    </LandingSection>
  );
};

GreetingSection.propTypes = propTypes;

export default GreetingSection;
