import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const SidebarRoot = styled.div`
  margin-left: 1rem;
  width: 26.25rem;

  ${breakpointMinSmall} {
    margin-left: 2rem;
  }
`;

export const SidebarGroup = styled.div`
  margin-bottom: 2em;
`;

export const SidebarGroupName = styled.span`
  display: block;

  font-size: 1em;
  font-weight: bold;

  margin-bottom: 1em;
`;

export const SidebarContent = styled.div`
  padding: 1.5rem;

  background-color: ${color("bg-light")};
  border-radius: 8px;

  ${SidebarGroup}:last-child {
    margin-bottom: 0;
  }
`;
