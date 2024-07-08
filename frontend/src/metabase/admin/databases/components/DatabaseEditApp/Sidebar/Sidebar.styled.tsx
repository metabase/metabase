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

const _SidebarGroup = styled.div`
  margin-bottom: 2em;
`;

const SidebarGroupName = styled.span`
  display: block;
  font-size: 1em;
  font-weight: bold;
  margin-bottom: 1em;
`;

const SidebarGroupList = styled.ol``;

const SidebarGroupListItem = styled.li<{ hasMarginTop?: boolean }>`
  ${({ hasMarginTop = true }) => hasMarginTop && "margin-top: 1rem;"}
`;

export const SidebarGroup = Object.assign(_SidebarGroup, {
  Name: SidebarGroupName,
  List: SidebarGroupList,
  ListItem: SidebarGroupListItem,
});

export const SidebarContent = styled.div`
  padding: 1.5rem;
  background-color: ${color("bg-light")};
  border-radius: 8px;

  ${SidebarGroup}:last-child {
    margin-bottom: 0;
  }
`;

export const ModelActionsSidebarContent = styled(SidebarContent)`
  margin-top: 32px;
`;
