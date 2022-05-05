import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

interface CellProps {
  hideBorderBottom?: boolean;
  isSecondary?: boolean;
}

const cellStyles = (props: CellProps) => css`
  padding: 1rem 0.5rem;
  font-weight: bold;
  color: ${props.isSecondary ? color("text-medium") : color("text-dark")};
  border-bottom: ${props.hideBorderBottom
    ? "none"
    : `1px solid ${color("border")}`};
`;

export const ColumnNameCell = styled.td`
  ${cellStyles}
  font-size: 16px;
`;

export const DataTypeCell = styled.td`
  ${cellStyles}
  font-weight: bold;
`;

export const HeaderCell = styled.th`
  padding: 1rem 0.5rem;
  border-bottom: 1px solid ${color("border")};
`;
