import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";
import { Collection } from "react-virtualized";

const EMPHASIZED_BG_COLOR = "#F8FAFB";

const CELL_HEIGHT = 30;

export const RowToggleIconRoot = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  color: ${color("text-light")};

  &:hover {
    color: ${color("brand")};
  }
`;

interface PivotTableCellProps {
  isBold?: boolean;
  isEmphasized?: boolean;
  isNightMode?: boolean;
  isBorderedHeader?: boolean;
  hasTopBorder?: boolean;
}

const getCellBackgroundColor = ({
  isEmphasized,
  isNightMode,
}: Partial<PivotTableCellProps>) => {
  if (!isEmphasized) {
    return isNightMode ? alpha("bg-black", 0.1) : color("white");
  }

  return isNightMode ? color("bg-black") : EMPHASIZED_BG_COLOR;
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
  border-right: 1px solid ${getBorderColor};
  border-bottom: 1px solid
    ${props =>
      props.isBorderedHeader ? color("bg-black") : getBorderColor(props)};
  background-color: ${getCellBackgroundColor};
  ${props =>
    props.hasTopBorder &&
    css`
      // compensate the top border
      line-height: ${CELL_HEIGHT - 1}px;
      border-top: 1px solid ${getBorderColor(props)};
    `}

  &:hover {
    background-color: ${alpha("brand", 0.1)};
  }
`;

interface PivotTableTopLeftCellsContainerProps {
  isNightMode?: boolean;
}

export const PivotTableTopLeftCellsContainer = styled.div<PivotTableTopLeftCellsContainerProps>`
  background-color: ${props =>
    getCellBackgroundColor({
      isEmphasized: true,
      isNightMode: props.isNightMode,
    })};
  display: flex;
  align-items: flex-end;
  border-right: 1px solid ${getBorderColor};
`;

interface HeaderCellsCollectionProps {
  isNightMode?: boolean;
}

export const HeaderCellsCollection = styled(
  Collection,
)<HeaderCellsCollectionProps>`
  background-color: ${props =>
    getCellBackgroundColor({
      isEmphasized: true,
      isNightMode: props.isNightMode,
    })};
`;
