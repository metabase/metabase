import styled from "@emotion/styled";

export const Heading = styled.h4`
  color: var(--mb-color-text-dark);
  font-size: 1.125rem;
`;

const SidebarContent = styled.div`
  padding: 1rem 2rem;
`;

export const SidebarHeader = styled(SidebarContent)`
  border-bottom: 1px solid var(--mb-color-border);
`;

export const SidebarBody = styled(SidebarContent)`
  flex: 1;
  overflow-y: auto;
`;

export const SidebarFooter = styled(SidebarContent)`
  justify-content: flex-end;
  display: flex;
  border-top: 1px solid var(--mb-color-border);
`;

export const ChangeActionContainer = styled.div`
  display: flex;
  justify-content: space-between;
`;
