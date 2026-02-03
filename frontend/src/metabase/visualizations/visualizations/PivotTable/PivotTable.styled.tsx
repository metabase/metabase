// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { adjustBrightness, alpha, color } from "metabase/lib/colors";
import type { MantineTheme } from "metabase/ui";

import { CELL_HEIGHT, RESIZE_HANDLE_WIDTH } from "./constants";

export const RowToggleIconRoot = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 200ms;
  outline: none;

  ${getRowToggleStyle}
`;

function getRowToggleStyle({ theme }: { theme: MantineTheme }) {
  const { textColor, backgroundColor } = theme.other.pivotTable.rowToggle;
  const hoverColor = adjustBrightness(backgroundColor, 0.2, 0.2);

  return css`
    color: ${color(textColor)};
    background-color: ${color(backgroundColor)};

    &:hover {
      background-color: ${color(hoverColor)};
    }
  `;
}

interface PivotTableCellProps {
  isBold?: boolean;
  isEmphasized?: boolean;
  isBorderedHeader?: boolean;
  hasTopBorder?: boolean;
  isTransparent?: boolean;
}

const getCellBackgroundColor = ({
  theme,
  isEmphasized,
  isTransparent,
}: Partial<PivotTableCellProps> & { theme: MantineTheme }) => {
  const backgroundColor = theme.other.table.cell.backgroundColor;
  const isDarkMode = theme.other.colorScheme === "dark";

  if (isTransparent) {
    return "transparent";
  }

  if (isEmphasized) {
    if (isDarkMode) {
      return color("background-primary-inverse");
    }

    if (backgroundColor) {
      return adjustBrightness(backgroundColor, 0.15, 0.05);
    }

    return alpha("border", 0.25);
  }

  if (isDarkMode) {
    return alpha("background-primary-inverse", 0.1);
  }

  return color(backgroundColor ?? "background-primary");
};

const getCellHoverBackground = (
  props: PivotTableCellProps & { theme: MantineTheme },
) => {
  const { cell: cellTheme } = props.theme.other.table;

  if (!cellTheme.backgroundColor) {
    return "var(--mb-color-border)";
  }

  const backgroundColor = getCellBackgroundColor(props);

  return adjustBrightness(backgroundColor, 0.15, 0.1);
};

const getColor = ({ theme }: PivotTableCellProps & { theme: MantineTheme }) => {
  if (theme.other.colorScheme === "dark") {
    return color("text-primary-inverse");
  }

  return color(theme.other.table.cell.textColor);
};

const borderRight = css`
  &:after {
    content: " ";
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    border-right: 1px solid ${color("border-subtle")};
  }
`;

export const PivotTableCell = styled.div<PivotTableCellProps>`
  flex: 1 0 auto;
  position: relative;
  flex-basis: 0;
  line-height: ${CELL_HEIGHT}px;
  min-width: 0;
  min-height: 0;
  font-weight: ${(props) => (props.isBold ? "bold" : "normal")};
  cursor: ${(props) => (props.onClick ? "pointer" : "default")};
  color: ${getColor};
  ${borderRight}
  border-bottom: 1px solid
    ${(props) =>
    props.isBorderedHeader
      ? "var(--mb-color-border)"
      : "var(--mb-color-table-border)"};
  background-color: ${getCellBackgroundColor};
  ${(props) =>
    props.hasTopBorder &&
    css`
      /* compensate the top border */
      line-height: ${CELL_HEIGHT - 1}px;
      border-top: 1px solid ${color("border-subtle")};
    `}

  &:hover {
    background-color: ${getCellHoverBackground};
  }
`;

export const PivotTableTopLeftCellsContainer = styled.div`
  display: flex;
  align-items: flex-end;
  position: relative;
  ${borderRight}
  background-color: ${(props) =>
    getCellBackgroundColor({
      isEmphasized: true,
      theme: props.theme,
    })};
`;

interface PivotTableRootProps {
  isDashboard?: boolean;
  shouldOverflow?: boolean;
  shouldHideScrollbars?: boolean;
}

export const PivotTableRoot = styled.div<PivotTableRootProps>`
  height: 100%;
  overflow-y: hidden;
  overflow-x: ${(props) => (props.shouldOverflow ? "auto" : "hidden")};
  font-size: ${({ theme }) => theme.other.pivotTable.cell.fontSize};

  ${(props) =>
    props.isDashboard
      ? css`
          border-top: 1px solid ${color("border-subtle")};
        `
      : null}

  ${(props) =>
    props.shouldHideScrollbars
      ? css`
          & {
            user-select: none;
          }

          &::-webkit-scrollbar,
          & *::-webkit-scrollbar {
            display: none;
          }

          &,
          & * {
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE and Edge */
          }
        `
      : null}
`;

export const PivotTableSettingLabel = styled.span`
  font-weight: 700;
  color: var(--mb-color-text-primary);
`;

export const ResizeHandle = styled.div`
  z-index: 99;
  position: absolute;
  top: 0;
  bottom: 0;
  left: -${RESIZE_HANDLE_WIDTH - 1}px;
  width: ${RESIZE_HANDLE_WIDTH}px;
  cursor: ew-resize;

  &:active {
    background-color: var(--mb-color-brand);
  }

  &:hover {
    background-color: var(--mb-color-brand);
  }
`;
