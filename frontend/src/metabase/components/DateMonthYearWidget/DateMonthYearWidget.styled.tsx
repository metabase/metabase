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
  color: ${props => props.isSelected && color("white")};
  background-color: ${props => props.isSelected && color("brand")};

  &:hover {
    background-color: ${props => !props.isSelected && color("bg-light")};
  }
`;
