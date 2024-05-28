import { css } from "@emotion/react";
import styled from "@emotion/styled";

import {
  color,
  alpha,
  darken,
  lighten,
  isDark,
  shade,
} from "metabase/lib/colors";
import type { MantineTheme } from "metabase/ui";

import {
  CELL_HEIGHT,
  PIVOT_TABLE_FONT_SIZE,
  RESIZE_HANDLE_WIDTH,
} from "./constants";

export const RowToggleIconRoot = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  color: ${color("white")};
  padding: 4px;
  border-radius: 4px;
  background-color: ${color("text-light")};
  transition: all 200ms;
  outline: none;

  &:hover {
    background-color: ${darken("text-light", 0.2)};
  }
`;

interface PivotTableCellProps {
  isBold?: boolean;
  isEmphasized?: boolean;
  isNightMode?: boolean;
  isBorderedHeader?: boolean;
  hasTopBorder?: boolean;
  isTransparent?: boolean;
}

const getCellBackgroundColor = ({
  theme,
  isEmphasized,
  isNightMode,
  isTransparent,
}: Partial<PivotTableCellProps> & { theme: MantineTheme }) => {
  const { backgroundColor } = theme.other.table.cell;

  if (isTransparent) {
    return "transparent";
  }

  if (isEmphasized) {
    if (isNightMode) {
      return color("bg-black");
    }

    if (!backgroundColor) {
      return alpha("border", 0.25);
    }

    return isDark(backgroundColor)
      ? lighten(backgroundColor, 0.15)
      : shade(backgroundColor, 0.05);
  }

  if (isNightMode) {
    return alpha("bg-black", 0.1);
  }

  return color(backgroundColor);
};

const getCellHoverBackground = (
  props: PivotTableCellProps & { theme: MantineTheme },
) => {
  const { cell: cellTheme } = props.theme.other.table;

  if (!cellTheme.backgroundColor) {
    return color("border");
  }

  const backgroundColor = getCellBackgroundColor(props);

  return isDark(backgroundColor)
    ? lighten(backgroundColor, 0.15)
    : shade(backgroundColor, 0.1);
};

const getColor = ({
  theme,
  isNightMode,
}: PivotTableCellProps & { theme: MantineTheme }) => {
  if (isNightMode) {
    return color("white");
  }

  return color(theme.other.table.cell.textColor);
};

const getBorderColor = ({ isNightMode }: PivotTableCellProps) => {
  return isNightMode ? alpha("bg-black", 0.8) : color("border");
};

export const PivotTableCell = styled.div<PivotTableCellProps>`
  flex: 1 0 auto;
  position: relative;
  flex-basis: 0;
  line-height: ${CELL_HEIGHT}px;
  min-width: 0;
  min-height: 0;
  font-weight: ${props => (props.isBold ? "bold" : "normal")};
  cursor: ${props => (props.onClick ? "pointer" : "default")};
  color: ${getColor};
  box-shadow: -1px 0 0 0 ${getBorderColor} inset;
  border-bottom: 1px solid
    ${props =>
      props.isBorderedHeader ? color("bg-dark") : getBorderColor(props)};
  background-color: ${getCellBackgroundColor};
  ${props =>
    props.hasTopBorder &&
    css`
      // compensate the top border
      line-height: ${CELL_HEIGHT - 1}px;
      border-top: 1px solid ${getBorderColor(props)};
    `}

  &:hover {
    background-color: ${getCellHoverBackground};
  }
`;

interface PivotTableTopLeftCellsContainerProps {
  isNightMode?: boolean;
}

export const PivotTableTopLeftCellsContainer = styled.div<PivotTableTopLeftCellsContainerProps>`
  display: flex;
  align-items: flex-end;
  box-shadow: -1px 0 0 0 ${getBorderColor} inset;
  background-color: ${props =>
    getCellBackgroundColor({
      isEmphasized: true,
      isNightMode: props.isNightMode,
      theme: props.theme,
    })};
`;

interface PivotTableRootProps {
  isDashboard?: boolean;
  isNightMode?: boolean;
}

export const PivotTableRoot = styled.div<PivotTableRootProps>`
  height: 100%;
  font-size: ${PIVOT_TABLE_FONT_SIZE};

  ${props =>
    props.isDashboard
      ? css`
          border-top: 1px solid ${getBorderColor(props)};
        `
      : null}
`;

export const PivotTableSettingLabel = styled.span`
  font-weight: 700;
  color: ${color("text-dark")};
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
    background-color: ${color("brand")};
  }

  &:hover {
    background-color: ${color("brand")};
  }
`;
