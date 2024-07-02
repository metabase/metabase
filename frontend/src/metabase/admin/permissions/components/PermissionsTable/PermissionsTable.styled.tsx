import type { Theme } from "@emotion/react";
import styled from "@emotion/styled";

import Label from "metabase/components/type/Label";
import Link from "metabase/core/components/Link";
import { color, alpha } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

const getTableBorder = (theme: Theme) =>
  `1px solid ${alpha(theme.fn.themeColor("border"), 0.5)}`;

// background with 1px of border color at the bottom
// to work properly with sticky positioning
const getHeaderBackground = (theme: Theme) =>
  `linear-gradient(to top, ${alpha(
    theme.fn.themeColor("border"),
    0.5,
  )}, ${alpha(
    theme.fn.themeColor("border"),
    0.5,
  )} 1px, var(--mb-color-bg-white) 1px, var(--mb-color-bg-white) 100%)`;

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
      border-right: ${({ theme }) => getTableBorder(theme)};
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
  background: ${({ theme }) => getHeaderBackground(theme)};
  z-index: 1;

  &:first-of-type {
    background: ${({ theme }) => getHeaderBackground(theme)};
    z-index: 2;
    &:after {
      display: none;
    }
  }
`;

export const PermissionsTableRow = styled.tr`
  border-bottom: ${({ theme }) => getTableBorder(theme)};
`;

export const EntityName = styled.span`
  font-weight: 700;
`;

export const EntityNameLink = styled(Link)`
  display: inline;
  font-weight: 700;
  text-decoration: underline;
  color: ${() => color("admin-navbar")};
`;

export const HintIcon = styled(Icon)`
  color: var(--mb-color-text-light);
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
