import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";

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
}

export const PivotTableCell = styled.div<PivotTableCellProps>`
  flex: 1 0 auto;
  flex-basis: 0;
  line-height: ${CELL_HEIGHT}px;
  min-width: 0;
  min-height: 0;
  font-weight: ${props => (props.isBold ? "bold" : "normal")};
  cursor: ${props => (props.onClick ? "pointer" : "default")};
  color: ${color("text-dark")};
  box-shadow: 1px 0 0 0 ${color("border")}, 0 1px 0 0 ${color("border")},
    1px 1px 0 0 ${color("border")}, 1px 0 0 0 ${color("border")} inset,
    0 1px 0 0 ${color("border")} inset;
  background-color: ${props =>
    props.isEmphasized ? EMPHASIZED_BG_COLOR : "white"};

  &:hover {
    background-color: ${alpha("brand", 0.1)};
  }
`;

export const PivotTableTopLeftCellsContainer = styled.div`
  background-color: ${EMPHASIZED_BG_COLOR};
  display: flex;
  align-items: flex-end;
`;
