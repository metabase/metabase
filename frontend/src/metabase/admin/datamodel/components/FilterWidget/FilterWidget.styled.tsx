import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export interface FilterWidgetRootProps {
  isSelected: boolean;
}

export const FilterWidgetRoot = styled.div<FilterWidgetRootProps>`
  display: flex;
  flex-shrink: 0;
  border: 2px solid transparent;
  border-radius: 0.5rem;

  ${({ isSelected, theme }) =>
    isSelected &&
    css`
      border-color: ${theme.fn.themeColor("filter")};
    `}
`;

export const QueryOption = styled.span`
  font-weight: 700;

  &:hover {
    cursor: pointer;
  }
`;

export const FilterSection = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
`;

export const FilterField = styled(FilterSection)`
  color: var(--mb-color-filter);
  font-weight: 700;

  &:hover {
    cursor: pointer;
  }

  ${QueryOption} {
    color: var(--mb-color-filter);
  }
`;

export const FilterOperator = styled(FilterSection)`
  color: var(--mb-color-filter);

  ${QueryOption} {
    color: var(--mb-color-filter);
  }
`;
