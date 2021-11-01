import React from "react";
import PropTypes from "prop-types";

import Dimension from "metabase-lib/lib/Dimension";
import Icon from "metabase/components/Icon";
import IconWrapper from "metabase/components/IconWrapper";
import { color } from "metabase/lib/colors";

import { Container, Label } from "./DimensionLabel.styled";

DimensionLabel.propTypes = {
  dimension: PropTypes.instanceOf(Dimension).isRequired,
};

export default function DimensionLabel({ dimension }) {
  return (
    <Container>
      <IconWrapper borderRadius="4px" bg={color("brand")} p={0}>
        <Icon name={dimension.icon()} size={12} color={color("white")} />
      </IconWrapper>
      <Label>{dimension.displayName()}</Label>
    </Container>
  );
}
