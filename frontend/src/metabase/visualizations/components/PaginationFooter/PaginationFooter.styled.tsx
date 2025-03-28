// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const PaginationFooterRoot = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  margin-left: auto;
  text-align: right;
`;

export const PaginationMessage = styled.span`
  font-weight: bold;
`;

export const PaginationButton = styled.button<{
  direction: "next" | "previous";
}>`
  padding-left: ${(props) =>
    props.direction === "previous" ? "0.5rem" : "unset"};
  padding-right: 0.5rem;
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }

  ${(props) =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `}
`;
