// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const Root = styled.div<{
  inline?: boolean;
  marginBottom?: string;
  borderBottom?: boolean;
}>`
  ${(props) =>
    props.hidden &&
    css`
      display: none;
    `}

  ${(props) =>
    !props.hidden &&
    css`
      margin-bottom: ${props.marginBottom || "1.5em"};
    `}

  ${(props) =>
    props.inline &&
    !props.hidden &&
    css`
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    `}

    ${(props) =>
    props.borderBottom &&
    css`
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--mb-color-border);
    `}

  input {
    transition: border 0.3s;

    &:hover {
      transition: border 0.3s;
      border-color: var(--mb-color-brand);
    }
  }
`;
