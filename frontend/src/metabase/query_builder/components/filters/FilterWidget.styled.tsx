import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

export interface FilterWidgetRootProps {
  isSelected: boolean;
}

export const FilterWidgetRoot = styled.div<FilterWidgetRootProps>`
  display: flex;
  flex-shrink: 0;
  border: 2px solid transparent;
  border-radius: 0.5rem;

  ${({ isSelected }) =>
    isSelected &&
    css`
      border-color: ${color("filter")};
    `}
`;
