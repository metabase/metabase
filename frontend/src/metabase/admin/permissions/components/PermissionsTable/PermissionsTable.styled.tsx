// eslint-disable-next-line no-restricted-imports
import type { Theme } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { forwardRef } from "react";

import Link from "metabase/common/components/Link";
import Label from "metabase/common/components/type/Label";
import { Icon, type IconProps } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

const getTableBorder = (theme: Theme) =>
  `1px solid color-mix(in srgb, ${theme.fn.themeColor("border")}, transparent 50%)`;

// background with 1px of border color at the bottom
// to work properly with sticky positioning
const getHeaderBackground = (theme: Theme) =>
  `linear-gradient(
    to top,
    color-mix(in srgb, ${theme.fn.themeColor("border")} 50%, ${theme.fn.themeColor("background-primary")} 50%) 1px,
    var(--mb-color-background-primary) 1px,
    var(--mb-color-background-primary) 100%
  )`;

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
  background: var(--mb-color-background-primary);

  &:first-of-type {
    max-width: 300px;
    left: 0;
    top: 0;
    position: sticky;
    padding-left: 0;
    padding-right: 1.5rem;
    background: var(--mb-color-background-primary);

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

export const EntityNameLink = styled(Link)`
  display: inline;
  font-weight: 700;
  text-decoration: underline;
  color: ${() => color("admin-navbar-inverse")};
`;

export const HintIcon = styled(
  forwardRef<SVGSVGElement, IconProps>(function HintIcon(props, ref) {
    return (
      <Icon
        {...props}
        name={props.name ?? "info"}
        size={props.size ?? 16}
        ref={ref}
      />
    );
  }),
)`
  color: var(--mb-color-text-disabled);
  margin-left: 0.375rem;
  cursor: pointer;
`;

export const ColumnName = styled(Label)`
  display: inline;
  margin: 0;
`;
