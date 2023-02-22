import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const Root = styled.div`
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;

  background-color: ${color("bg-white")};
  line-height: 24px;

  box-shadow: 0 20px 20px ${color("shadow")};

  ${breakpointMinSmall} {
    border: 1px solid ${color("border")};
    border-radius: 6px;
    box-shadow: 0 7px 20px ${color("shadow")};
  }
`;

export const EmptyStateContainer = styled.div`
  margin: 3rem 0;
`;

export const Header = styled.h4`
  padding: 0.5rem 1rem;
`;

export const RecentListItemContent = styled.div`
  display: flex;
  align-items: flex-start;
`;
