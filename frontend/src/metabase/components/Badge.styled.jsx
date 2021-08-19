import React from "react";
import PropTypes from "prop-types";
import styled, { css } from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

const propTypes = {
  to: PropTypes.oneOfType([PropTypes.string, PropTypes.boolean]),
};

function RawMaybeLink({ to, ...props }) {
  return to ? <Link to={to} {...props} /> : <span {...props} />;
}

RawMaybeLink.propTypes = propTypes;

const hoverStyle = css`
  cursor: pointer;
  color: ${props => color(props.activeColor)};
`;

export const MaybeLink = styled(RawMaybeLink)`
  display: flex;
  align-items: center;
  font-size: 0.875em;
  font-weight: bold;
  color: ${color("text-medium")};

  :hover {
    ${props => (props.to || props.onClick) && hoverStyle}
  }
`;

export const BadgeIcon = styled(Icon)`
  margin-right: ${props => (props.hasMargin ? "5px" : 0)};
`;
