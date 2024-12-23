import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const MonthList = styled.div`
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  padding: 0.5rem;
`;

export const MonthContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 33.33%;
`;

interface MonthRootProps {
  isSelected: boolean;
}

export const MonthRoot = styled.div<MonthRootProps>`
  cursor: pointer;
  font-weight: bold;
  width: 100%;
  text-align: center;
  margin: 0.5rem 0;
  padding: 0.5rem 1rem;
  border-radius: 99px;
  ${props =>
    props.isSelected &&
    css`
      color: var(--mb-color-text-selected);
      background-color: var(--mb-color-background-selected);
    `};

  &:hover {
    ${props =>
      !props.isSelected &&
      css`
        color: var(--mb-color-text-hover);
        background-color: var(--mb-color-background-hover);
      `}
  }
`;
