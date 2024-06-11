import styled from "@emotion/styled";

import {
  StyledFormButtonsGroup,
  FormBox,
} from "metabase/admin/performance/components/StrategyForm.styled";
import { Group } from "metabase/ui";

export const SidebarCacheFormBody = styled(Group)`
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
