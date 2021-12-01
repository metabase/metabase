import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Section, { SectionHeader, SectionTitle } from "../LandingSection";

const propTypes = {
  dashboards: PropTypes.array.isRequired,
  isAdmin: PropTypes.bool,
  onRemoveSection: PropTypes.func,
};

const StartHereSection = () => {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{t`Start here`}</SectionTitle>
      </SectionHeader>
    </Section>
  );
};

StartHereSection.propTypes = propTypes;

export default StartHereSection;
