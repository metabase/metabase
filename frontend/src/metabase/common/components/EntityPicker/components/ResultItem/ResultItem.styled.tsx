import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const ChunkyListItem = styled.button<{
  isSelected?: boolean;
  isLast?: boolean;
}>`
  padding: 1.5rem;
  cursor: pointer;
  background-color: ${({ isSelected }) =>
    isSelected ? "var(--mb-color-brand)" : "var(--mb-color-bg-white)"};
  color: ${({ isSelected }) =>
    isSelected ? "var(--mb-color-text-white)" : "var(--mb-color-text-dark)"};
  outline-offset: -3px;

  &:hover {
    ${({ isSelected }) =>
      !isSelected &&
      css`
        background-color: var(--mb-color-brand-lighter);
        color: var(--mb-color-text-dark);
      `}
  }

  ${({ isLast }) =>
    !isLast &&
    css`
      border-bottom: 1px solid var(--mb-color-border);
    `};

  display: flex;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

export const ChunkyList = styled.div`
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;
