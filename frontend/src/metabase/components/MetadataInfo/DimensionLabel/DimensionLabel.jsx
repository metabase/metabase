import React from "react";
import PropTypes from "prop-types";

import Dimension from "metabase-lib/lib/Dimension";

import {
  LabelContainer,
  Label,
  InvertedColorRelativeSizeIcon,
} from "../MetadataInfo.styled";

DimensionLabel.propTypes = {
  className: PropTypes.string,
  dimension: PropTypes.instanceOf(Dimension).isRequired,
};

export default function DimensionLabel({ className, dimension }) {
  return (
    <LabelContainer className={className}>
      <InvertedColorRelativeSizeIcon name={dimension.icon()} />
      <Label>{dimension.displayName()}</Label>
    </LabelContainer>
  );
}
