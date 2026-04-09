// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const Root = styled.div<{
  inline?: boolean;
}>`
  margin-inline: 1.5rem;
  margin-bottom: 1.5rem;

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
