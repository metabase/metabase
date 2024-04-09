import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const SidebarAside = styled.aside<{ $width: number }>`
  display: flex;
  flex-direction: column;
  width: ${props => props.$width}px;
  min-width: ${props => props.$width}px;
  border-left: 1px solid ${color("border")};
  background: ${color("bg-white")};
`;

export const ChildrenContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: auto;
  overflow-y: auto;
`;

export const ButtonContainer = styled.div<{ spaceBetween?: boolean }>`
  display: flex;
  justify-content: ${props =>
    props.spaceBetween ? "space-between" : "flex-start"};
  align-items: center;
  gap: 20px;
  padding: 12px 32px;
  border-top: 1px solid ${color("border")};
`;
