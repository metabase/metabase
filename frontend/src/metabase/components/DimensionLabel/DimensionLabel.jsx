import React from "react";
import PropTypes from "prop-types";

import Dimension from "metabase-lib/lib/Dimension";

import {
  Container,
  Label,
  PaddedInvertedColorIcon,
} from "./DimensionLabel.styled";

DimensionLabel.propTypes = {
  className: PropTypes.string,
  dimension: PropTypes.instanceOf(Dimension).isRequired,
};

export default function DimensionLabel({ className, dimension }) {
  return (
    <Container className={className}>
      <PaddedInvertedColorIcon name={dimension.icon()} />
      <Label>{dimension.displayName()}</Label>
    </Container>
  );
}
