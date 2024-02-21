import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { AuditSidebar } from "../components/AuditSidebar";

export const DeprecationNotice = styled.div`
  background-color: ${color("bg-light")};
  border-bottom: 1px solid ${color("border")};
`;

export const AuditSidebarStyled = styled(AuditSidebar)`
  min-height: 100vh;
  width: 346px;
  background-color: var(--color-bg-light);
  border-left: 2px solid var(--color-border);
`;
