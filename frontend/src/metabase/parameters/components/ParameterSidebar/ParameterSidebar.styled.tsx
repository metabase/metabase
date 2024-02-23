import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const SidebarHeader = styled.div`
  display: flex;
  justify-content: space-evenly;
  border-bottom: 1px solid ${color("border")};
`;

export const SidebarBody = styled.div`
  padding: 0 1rem;
`;
