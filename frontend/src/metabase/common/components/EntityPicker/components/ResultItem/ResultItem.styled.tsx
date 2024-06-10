import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ChunkyListItem = styled.button<{
  isSelected?: boolean;
  isLast?: boolean;
}>`
  padding: 1.5rem;
  cursor: pointer;

  background-color: ${({ isSelected }) =>
    isSelected ? color("brand") : color("bg-white")};

  color: ${({ isSelected }) =>
    isSelected ? color("text-white") : color("text-dark")};

  &:hover {
    ${({ isSelected }) =>
      !isSelected &&
      css`
        background-color: var(--mb-color-brand-lighter);
        color: ${color("text-dark")};
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
