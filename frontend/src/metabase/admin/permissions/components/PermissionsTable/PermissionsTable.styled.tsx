import styled from "@emotion/styled";

import Label from "metabase/components/type/Label";
import Link from "metabase/core/components/Link";
import { color, alpha } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

const tableBorder = `1px solid ${alpha(color("border"), 0.5)}`;

// background with 1px of border color at the bottom
// to work properly with sticky positioning
const headerBackground = `linear-gradient(to top, ${alpha(
  color("border"),
  0.5,
)}, ${alpha(color("border"), 0.5)} 1px, ${color("white")} 1px, ${color(
  "white",
)} 100%)`;

export const PermissionsTableRoot = styled.table`
  border-collapse: collapse;
  max-height: 100%;
  overflow-y: auto;
  min-width: max-content;
`;

export const PermissionsTableCell = styled.td`
  vertical-align: center;
  padding: 0.625rem 1rem;
  box-sizing: border-box;
  min-height: 40px;
  overflow: hidden;

  &:first-of-type {
    max-width: 300px;
    background: white;
    left: 0;
    top: 0;
    position: sticky;
    padding-left: 0;
    padding-right: 1.5rem;

    &:after {
      position: absolute;
      right: 0;
      top: 0;
      height: 100%;
      border-right: ${tableBorder};
      content: " ";
    }
  }
`;

export const PermissionTableHeaderCell = styled(
  PermissionsTableCell.withComponent("th"),
)`
  position: sticky;
  top: 0;
  border: none;
  background: ${headerBackground};
  z-index: 1;

  &:first-of-type {
    background: ${headerBackground};
    z-index: 2;

    &:after {
      display: none;
    }
  }
`;

export const PermissionsTableRow = styled.tr`
  border-bottom: ${tableBorder};
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

export const HintIcon = styled(Icon)`
  color: ${color("text-light")};
  margin-left: 0.375rem;
  cursor: pointer;
`;

HintIcon.defaultProps = {
  name: "info",
  size: 16,
};

export const ColumnName = styled(Label)`
  display: inline;
  margin: 0;
`;
