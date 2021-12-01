import React from "react";
import PropTypes from "prop-types";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import Section, { SectionHeader, SectionTitle } from "../LandingSection";

const propTypes = {
  user: PropTypes.object.isRequired,
  collections: PropTypes.array.isRequired,
};

const CollectionSection = () => {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{ROOT_COLLECTION.name}</SectionTitle>
      </SectionHeader>
    </Section>
  );
};

CollectionSection.propTypes = propTypes;

export default CollectionSection;
