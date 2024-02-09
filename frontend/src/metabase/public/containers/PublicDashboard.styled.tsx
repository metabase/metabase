import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import {
  breakpointMinSmall,
  breakpointMinLarge,
} from "metabase/styled-components/theme";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";

export const StyledDashboardTabs = styled(DashboardTabs)`
  border-bottom: 1px solid ${color("border")};

  padding: 0 0.5rem;

  ${breakpointMinSmall} {
    padding: 0 1rem;
  }

  ${breakpointMinLarge} {
    padding: 0 1.5rem;
  }
`;

export const DashboardContainer = styled(FullWidthContainer)`
  margin-top: 0.5rem;
`;
