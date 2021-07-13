import React from "react";
import PropTypes from "prop-types";
import { Flex } from "@rebass/grid";
import { color } from "styled-system";
import { color as metabaseColors } from "metabase/lib/colors";

const IconWrapper = props => (
  <Flex
    {...props}
    css={`
      color: ${color};
      border-radius: ${props => props.borderRadius};
    `}
  />
);

IconWrapper.defaultProps = {
  borderRadius: 6,
  bg: metabaseColors("bg-medium"),
  align: "center",
  justify: "center",
};

IconWrapper.propTypes = {
  borderRadius: PropTypes.number,
};

export default IconWrapper;
