import styled from "@emotion/styled";

import { Box, type BoxProps } from "metabase/ui";

interface FilterTabItemProps extends BoxProps {
  component?: string;
}

export const FilterTabItem = styled(Box)<FilterTabItemProps>`
  border-bottom: 1px solid hsla(0, 0%, 94%, 1);
  padding: 0;
  padding-block: 8px;
  padding-right: 16px;

  &:last-of-type {
    border-bottom: none;
  }

  &:hover,
  &:focus-within {
    background-color: hsla(240, 11%, 98%, 1);
  }
`;
