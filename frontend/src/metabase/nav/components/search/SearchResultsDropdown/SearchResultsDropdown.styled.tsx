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

  ul {
    overflow-y: auto;
    padding: 0.5rem 0;
  }
`;

export const SearchDropdownFooter = styled(Group)`
  border-top: 1px solid ${({ theme }) => theme.colors.border[0]};

  &:hover {
    background-color: ${({ theme }) => theme.colors.bg[0]};
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;
  }
`;
