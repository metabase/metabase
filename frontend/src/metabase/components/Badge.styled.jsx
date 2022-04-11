import React from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import { shouldForwardNonTransientProp } from "metabase/lib/styling/emotion";

const propTypes = {
  to: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
};

function RawMaybeLink({ to, ...props }) {
  return to ? <Link to={to} {...props} /> : <span {...props} />;
}

RawMaybeLink.propTypes = propTypes;

const hoverStyle = props => css`
  cursor: pointer;
  color: ${color(props.activeColor)};
`;

export const MaybeLink = styled(RawMaybeLink)`
  display: flex;
  align-items: center;
  font-size: 0.875em;
  font-weight: bold;
  color: ${props => color(props.inactiveColor)};

  :hover {
    ${props => (props.to || props.onClick) && hoverStyle(props)}
  }
`;

export const BadgeIcon = styled(Icon, {
  shouldForwardProp: shouldForwardNonTransientProp,
})`
  margin-right: ${props => (props.$hasMargin ? "5px" : 0)};
`;
