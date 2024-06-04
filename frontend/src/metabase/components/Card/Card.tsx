import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color, alpha } from "metabase/lib/colors";

type CardProps = {
  className?: string;
  dark?: boolean;
  hoverable?: boolean;
  flat?: boolean;
  compact?: boolean;
};

const Card = styled.div<CardProps>`
  background-color: ${props => (props.dark ? color("text-dark") : "white")};
  border: 1px solid
    ${props => (props.dark ? "transparent" : color("bg-medium"))};
  ${props => props.dark && `color: white`};
  border-radius: 6px;
  box-shadow: 0 7px 20px var(--mb-color-shadow);
  line-height: 24px;
  ${props =>
    props.hoverable &&
    css`
      &:hover {
        box-shadow: 0 10px 22px ${() => alpha(color("shadow"), 0.09)};
      }
    `};
  ${props =>
    props.flat &&
    css`
      box-shadow: none;
    `};
  ${props =>
    props.compact &&
    css`
      box-shadow: 0 1px 2px var(--mb-color-shadow);
    `};
`;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Card;
