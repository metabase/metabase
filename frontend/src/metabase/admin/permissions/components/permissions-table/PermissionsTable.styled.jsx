import styled from "styled-components";
import { color, alpha } from "metabase/lib/colors";
import Link from "metabase/components/Link";

export const PermissionsTableRoot = styled.table`
  border-collapse: collapse;
  width: 100%;
`;

export const PermissionsTableRow = styled.tr`
  border-top: 1px solid ${alpha(color("border"), 0.5)};
`;

export const PermissionsTableCell = styled.td`
  padding: 0.5rem 0.5rem;

  &:first-of-type {
    padding-left: 3rem;
  }
`;

export const EntityNameCell = styled(PermissionsTableCell)`
  min-width: 280px;
`;

export const EntityNameLink = styled(Link)`
  font-weight: 700;
  color: ${color("admin-navbar")};
`;

export const PermissionTableHeaderRow = styled.tr``;
