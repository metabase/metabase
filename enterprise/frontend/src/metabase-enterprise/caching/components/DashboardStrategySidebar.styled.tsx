import styled from "@emotion/styled";

import {
  FormBox,
  StyledFormButtonsGroup,
} from "metabase/admin/performance/components/StrategyForm.styled";
import { Group } from "metabase/ui";

export const DashboardStrategySidebarBody = styled(Group)`
  display: flex;
  flex-flow: column nowrap;
  height: 100%;
  ${StyledFormButtonsGroup} {
    border-top: 1px solid var(--mb-color-border);
    position: sticky;
    bottom: 0;
  }
  ${FormBox} {
    border-bottom: 0 !important;
  }
`;
