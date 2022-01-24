import styled from "styled-components";

import { color, alpha, lighten } from "metabase/lib/colors";
import Link from "metabase/components/Link";
import Icon from "metabase/components/Icon";
import { forwardRefToInnerRef } from "metabase/styled-components/utils";

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
  padding: 0.5rem 1rem;
  width: auto;
  min-width: 220px;

  &:first-of-type {
    max-width: 340px;
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

export const HintIcon = forwardRefToInnerRef(styled(Icon).attrs({
  name: "info",
  size: 12,
})`
  color: ${lighten("text-dark", 0.3)};
  margin-left: 0.375rem;
  cursor: pointer;
`);
