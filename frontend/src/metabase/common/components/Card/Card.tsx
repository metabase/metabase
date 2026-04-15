// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

type CardProps = {
  className?: string;
  dark?: boolean;
  hoverable?: boolean;
  flat?: boolean;
  compact?: boolean;
};

export const Card = styled.div<CardProps>`
  background-color: ${(props) =>
    props.dark
      ? "var(--mb-color-background-primary-inverse)"
      : "var(--mb-color-background-primary)"};
  border: 1px solid
    ${(props) => (props.dark ? "transparent" : "var(--mb-color-border)")};
  ${(props) => props.dark && `color: white`};
  border-radius: var(--mantine-radius-md);
  box-shadow: 0 7px 20px var(--mb-color-shadow);
  line-height: 24px;
  ${({ hoverable }) =>
    hoverable &&
    css`
      &:hover {
        box-shadow: 0 10px 22px var(--mb-color-shadow);
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
