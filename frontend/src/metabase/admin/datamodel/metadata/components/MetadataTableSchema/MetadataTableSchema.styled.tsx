import type { Theme } from "@emotion/react";
import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";

interface CellProps {
  isBordered?: boolean;
  isSecondary?: boolean;
}

const getCellStyles = (props: CellProps & { theme: Theme }) => css`
  padding: 1rem 0.5rem;
  font-weight: bold;
  color: ${props.isSecondary
    ? props.theme.fn.themeColor("text-medium")
    : props.theme.fn.themeColor("text-dark")};
  border-bottom: ${props.isBordered
    ? `1px solid ${props.theme.fn.themeColor("border")}`
    : "none"};
`;

export const ColumnNameCell = styled.td`
  ${getCellStyles};
  font-size: 1rem;
`;

export const DataTypeCell = styled.td`
  ${getCellStyles};
  font-weight: bold;
`;

export const HeaderCell = styled.th`
  padding: 1rem 0.5rem;
  border-bottom: 1px solid ${color("border")};
`;
