// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";

type CardProps = {
  className?: string;
  dark?: boolean;
  hoverable?: boolean;
  flat?: boolean;
  compact?: boolean;
};

const Card = styled.div<CardProps>`
  background-color: ${(props) =>
    props.dark
      ? "var(--mb-color-background-inverse)"
      : "var(--mb-color-background)"};
  border: 1px solid
    ${(props) => (props.dark ? "transparent" : "var(--mb-color-border)")};
  ${(props) => props.dark && `color: white`};
  border-radius: var(--mantine-radius-md);
  box-shadow: 0 7px 20px var(--mb-color-shadow);
  line-height: 24px;
  ${({ hoverable, theme }) =>
    hoverable &&
    css`
      &:hover {
        box-shadow: 0 10px 22px ${alpha(theme.fn.themeColor("shadow"), 0.09)};
      }
    `};
  ${(props) =>
    props.flat &&
    css`
      box-shadow: none;
    `};
  ${(props) =>
    props.compact &&
    css`
      box-shadow: 0 1px 2px var(--mb-color-shadow);
    `};
`;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Card;
