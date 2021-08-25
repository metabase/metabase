import styled from "styled-components";
import { color, alpha } from "metabase/lib/colors";
import Link from "metabase/components/Link";

const HORIZONTAL_PADDING_VARIANTS = {
  sm: "0.5rem",
  lg: "3rem",
};

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
    padding: 0.5rem
      ${props => HORIZONTAL_PADDING_VARIANTS[props.horizontalPadding]};
  }
`;

export const EntityNameCell = styled(PermissionsTableCell)`
  min-width: 280px;
  display: flex;
  align-items: center;
`;

export const EntityName = styled.div`
  font-weight: 700;
`;

export const EntityNameLink = styled(Link)`
  font-weight: 700;
  text-decoration: underline;
  color: ${color("admin-navbar")};
`;

export const PermissionTableHeaderRow = styled.tr``;
