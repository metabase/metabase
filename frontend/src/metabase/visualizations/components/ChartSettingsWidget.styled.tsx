// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const Root = styled.div<{
  inline?: boolean;
}>`
  margin-left: 2rem;
  margin-right: 2rem;
  margin-bottom: 1.5em;

  ${(props) =>
    props.hidden &&
    css`
      display: none;
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

  input {
    transition: border 0.3s;

    &:hover {
      transition: border 0.3s;
      border-color: var(--mb-color-brand);
    }
  }
`;
