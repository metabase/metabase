import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { color, alpha, darken } from "metabase/lib/colors";

export const CELL_HEIGHT = 30;

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
  isEmphasized,
  isNightMode,
  isTransparent,
}: Partial<PivotTableCellProps>) => {
  if (isTransparent) {
    return "transparent";
  }

  if (!isEmphasized) {
    return isNightMode ? alpha("bg-black", 0.1) : color("white");
  }

  return isNightMode ? color("bg-black") : alpha("border", 0.25);
};

const getColor = ({ isNightMode }: PivotTableCellProps) => {
  return isNightMode ? color("white") : color("text-dark");
};

const getBorderColor = ({ isNightMode }: PivotTableCellProps) => {
  return isNightMode ? alpha("bg-black", 0.8) : color("border");
};

export const PivotTableCell = styled.div<PivotTableCellProps>`
  flex: 1 0 auto;
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
    background-color: ${color("border")};
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
    })};
`;

interface PivotTableRootProps {
  isDashboard?: boolean;
  isNightMode?: boolean;
}

export const PivotTableRoot = styled.div<PivotTableRootProps>`
  height: 100%;
  font-size: 0.875em;

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
