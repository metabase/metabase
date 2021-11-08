import React from "react";
import styled, { css } from "styled-components";
import Badge from "metabase/components/Badge";
import { color } from "metabase/lib/colors";

export const Container = styled.span`
  display: flex;
  align-items: center;
  flex-wrap: wrap;

  ${props =>
    props.variant === "head" &&
    css`
      font-size: 1.25rem;
    `}
`;

export const HeaderBadge = styled(Badge)`
  .Icon {
    width: 1em;
    height: 1em;
    margin-right: 0.5em;
  }
`;

const DividerSpan = styled.span`
  color: ${color("text-light")};
  font-size: 0.8em;
  font-weight: bold;
  padding-left: 0.5em;
  padding-right: 0.5em;
  user-select: none;
`;

export function Divider() {
  return <DividerSpan>/</DividerSpan>;
}
