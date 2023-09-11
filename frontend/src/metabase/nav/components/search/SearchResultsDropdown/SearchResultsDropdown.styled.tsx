import styled from "@emotion/styled";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import type { PaperProps } from "metabase/ui";
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

export const SearchDropdownFooter = styled(Group)`
  padding-top: 0.625rem;
  padding-bottom: 0.625rem;
  border-top: 1px solid ${({ theme }) => theme.colors.border[0]};

  &:hover {
    color: ${({ theme }) => theme.colors.brand[1]};
    cursor: pointer;
    transition: color 0.2s ease-in-out;
  }
`;
