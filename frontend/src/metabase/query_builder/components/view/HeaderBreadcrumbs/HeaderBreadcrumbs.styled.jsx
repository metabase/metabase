import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import Badge, { MaybeLink } from "metabase/components/Badge";
import { color } from "metabase/lib/colors";

export const Container = styled.span`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
`;

export const SubHeadContainer = styled(Container)`
  margin-bottom: -0.5rem;
`;

export const TitleOrLink = styled(MaybeLink)`
  display: flex;
  align-items: center;
  color: ${props => color(props.to ? "text-medium" : "text-dark")};
`;

const DividerSpan = styled.span`
  color: ${color("text-light")};
  font-size: 0.8em;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
`;

export const SubHeadBadge = styled(Badge)`
  margin-right: 1rem;
  margin-bottom: 0.5rem;
`;

Divider.propTypes = {
  children: PropTypes.string,
};

export function Divider({ children = "•" }) {
  return <DividerSpan>{children}</DividerSpan>;
}
