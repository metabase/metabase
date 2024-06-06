import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import type { PaperProps, GroupProps } from "metabase/ui";
import { Group, Paper } from "metabase/ui";

export const SearchResultsContainer = styled(Paper)<PaperProps>`
  display: flex;
  flex-direction: column;

  ${breakpointMaxSmall} {
    height: calc(100vh - ${APP_BAR_HEIGHT});
  }

  ${breakpointMinSmall} {
    max-height: 400px;
  }
`;

const selectedStyles = css`
  color: var(--mb-color-brand);
  background-color: var(--mb-color-brand-lighter);
  cursor: pointer;
  transition: all 0.2s ease-in-out;
`;

export const SearchDropdownFooter = styled(Group, {
  shouldForwardProp: propName => propName !== "isSelected",
})<{ isSelected?: boolean } & GroupProps>`
  border-top: 1px solid var(--mb-color-border);

  ${({ isSelected }) => isSelected && selectedStyles}
  &:hover {
    ${selectedStyles}
  }
`;
