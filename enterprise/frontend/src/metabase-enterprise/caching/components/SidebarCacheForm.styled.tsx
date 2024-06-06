import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Group } from "metabase/ui";

export const SidebarCacheFormBody = styled(Group)`
  display: flex;
  flex-flow: column nowrap;
  height: 100%;
  .form-buttons-group {
    border-top: 1px solid ${color("border")};
    position: sticky;
    bottom: 0;
  }
  .strategy-form-box {
    border-bottom: 0 !important;
  }
`;
