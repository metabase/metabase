import styled from "styled-components";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const SidebarFooter = styled.div`
  padding: 0 ${space(3)} ${space(2)};
`;

export const SidebarError = styled.div`
  color: ${color("error")};
`;
