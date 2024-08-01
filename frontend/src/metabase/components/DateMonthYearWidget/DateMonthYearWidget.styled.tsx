import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

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

export interface MonthRootProps {
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
  color: ${props => props.isSelected && color("text-white")};
  background-color: ${props =>
    props.isSelected && "var(--mb-color-background-brand)"};

  &:hover {
    ${props =>
      !props.isSelected &&
      css`
        color: var(--mb-color-text-selected);
        background-color: var(--mb-color-background-selected);
      `}
  }
`;
