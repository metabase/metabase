import styled from "@emotion/styled";

import { GridItem } from "metabase/components/Grid";
import ExternalLink from "metabase/core/components/ExternalLink";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

const getPercentage = (number: number): string => {
  return `${number * 100}%`;
};

export const OptionsRoot = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  height: 100%;

  margin: auto 0.5rem;

  ${breakpointMinSmall} {
    margin-left: 4rem;
    margin-right: 4rem;
  }
`;

export const EducationalButton = styled(ExternalLink)`
  background-color: var(--mb-color-bg-medium);
  border-radius: 0.5rem;
  color: var(--mb-color-brand);
  font-weight: bold;
  padding: 1em;
  transition: all 0.3s;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-brand);
  }
`;

export interface OptionsGridItemProps {
  itemsCount: number;
}

export const OptionsGridItem = styled(GridItem)<OptionsGridItemProps>`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: ${props => getPercentage(1 / props.itemsCount)};
  }
`;
