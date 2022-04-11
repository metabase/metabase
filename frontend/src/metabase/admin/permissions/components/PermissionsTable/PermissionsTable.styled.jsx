import styled from "@emotion/styled";

import { color, alpha, lighten } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";

export const PermissionsTableRoot = styled.table`
  border-collapse: collapse;
`;

export const PermissionsTableCell = styled.td`
  vertical-align: center;
  padding: 0.625rem 2rem;
  box-sizing: border-box;
  min-height: 40px;

  &:first-of-type {
    min-width: 300px;
    background: white;
    left: 0;
    top: 0;
    position: sticky;
    padding-left: 0;

    &:after {
      position: absolute;
      right: 0;
      top: 0;
      height: 100%;
      border-right: 1px solid ${alpha(color("border"), 0.5)};
      content: " ";
    }
  }
`;

export const PermissionTableHeaderCell = styled(
  PermissionsTableCell.withComponent("th"),
)`
  &:first-of-type {
    &:after {
      display: none;
    }
  }
`;

export const PermissionsTableRow = styled.tr`
  border-top: 1px solid ${alpha(color("border"), 0.5)};
  border-bottom: 1px solid ${alpha(color("border"), 0.5)};
`;

export const EntityName = styled.span`
  font-weight: 700;
`;

export const EntityNameLink = styled(Link)`
  display: inline;
  font-weight: 700;
  text-decoration: underline;
  color: ${color("admin-navbar")};
`;

export const PermissionTableHeaderRow = styled.tr``;

export const HintIcon = styled(Icon)`
  color: ${lighten("text-dark", 0.3)};
  margin-left: 0.375rem;
  cursor: pointer;
`;

HintIcon.defaultProps = {
  name: "info",
  size: 12,
};

export const ColumnName = styled(Label)`
  display: inline;
  margin: 0;
`;
