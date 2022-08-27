import styled from "@emotion/styled";
import { color, darken } from "metabase/lib/colors";

export const SidebarItem = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

export const CloseIconContainer = styled.span`
  margin-left: auto;
  padding: 1rem;
  border-left: 1px solid ${darken("brand", 0.2)};
`;

export const Heading = styled.h4`
  color: ${color("text-dark")};
  padding-top: 22px;
  padding-bottom: 16px;
  margin-bottom: 8px;
`;

export const SidebarContent = styled.div`
  padding-left: 32px;
  padding-right: 32px;
`;

export const SidebarContentBordered = styled(SidebarContent)`
  padding-bottom: 2rem;
  border-bottom: 1px solid ${color("border")};
`;

export const SidebarHeader = styled.div`
  border-bottom: 1px solid ${color("border")};
  padding-left: 32px;
  padding-right: 36px;
  margin-bottom: 16px;
`;

export const SidebarIconWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;

  width: 36px;
  height: 36px;
  margin-right: 10px;

  border: 1px solid #f2f2f2;
  border-radius: 8px;
`;
