import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const SidebarRoot = styled.aside`
  width: 300px;
  height: 100%;
  border-right: 1px solid ${color("border")};
`;

export const SidebarHeader = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${color("border")};
`;

export const SidebarContent = styled.div`
  padding: 1rem 0;
  overflow-y: auto;
`;

export const EntityGroupsDivider = styled.hr`
  margin: 1rem 1.5rem;
  border: 0;
  border-top: 1px solid ${color("border")};
`;
