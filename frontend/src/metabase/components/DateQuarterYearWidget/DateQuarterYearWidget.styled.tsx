import { css } from "@emotion/react";
import styled from "@emotion/styled";

interface QuarterRootProps {
  isSelected: boolean;
}

export const QuarterRoot = styled.li<QuarterRootProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 75px;
  height: 75px;
  cursor: pointer;

  &:hover {
    color: var(--mb-color-text-hover);
    background-color: var(--mb-color-background-hover);
  }

  ${({ isSelected }) =>
    isSelected &&
    css`
      color: var(--mb-color-text-selected);
      background-color: var(--mb-color-background-selected);
    `}
`;
