import styled from "@emotion/styled";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { GridItem } from "metabase/components/Grid";

const getPercentage = (number: number): string => {
  return `${number * 100}%`;
};

export const QueryOptionsRoot = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;

  height: 100%;

  margin: auto 0.5rem;

  ${breakpointMinSmall} {
    margin-left: 4rem;
    margin-right: 4rem;
  }
`;

export interface QueryOptionsGridItemProps {
  itemsCount: number;
}

export const QueryOptionsGridItem = styled(GridItem)<QueryOptionsGridItemProps>`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: ${props => getPercentage(1 / props.itemsCount)};
  }
`;
