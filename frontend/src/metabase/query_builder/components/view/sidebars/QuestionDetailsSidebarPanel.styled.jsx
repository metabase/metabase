import styled from "styled-components";

import SidebarContent from "metabase/query_builder/components/SidebarContent";

export const SidebarOuterContainer = styled(SidebarContent)`
  height: 100%;
`;

export const SidebarInnerContainer = styled.div`
  display: flex;
  flex-direction: column;
  row-gap: 1rem;
  padding: 0.5rem 1.5rem;
`;
