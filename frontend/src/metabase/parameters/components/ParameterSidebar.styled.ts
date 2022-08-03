import styled from "@emotion/styled";
import Sidebar from "metabase/dashboard/components/Sidebar";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const ResponsiveSidebar = styled(Sidebar)`
  ${breakpointMaxSmall} {
    width: 100%;
    border-left: none;
  }
`;
