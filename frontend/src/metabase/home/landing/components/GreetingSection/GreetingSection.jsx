import React from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import MetabotLogo from "metabase/components/MetabotLogo";
import Tooltip from "metabase/components/Tooltip";
import Section from "../LandingSection";
import { GreetingContent, GreetingTitle } from "./GreetingSection.styled";
import { getGreeting } from "../../selectors";

const propTypes = {
  greeting: PropTypes.string.isRequired,
};

export const GreetingSection = ({ greeting }) => {
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

const mapStateToProps = state => ({
  greeting: getGreeting(state),
});

export default connect(mapStateToProps)(GreetingSection);
