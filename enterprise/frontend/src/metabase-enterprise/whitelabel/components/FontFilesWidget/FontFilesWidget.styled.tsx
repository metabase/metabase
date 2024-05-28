import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

const cellStyles = css`
  padding-left: 1.5rem;
  padding-right: 1.5rem;

  &:first-of-type {
    flex: 0 0 auto;
    width: 12rem;
  }

  &:last-of-type {
    flex: 1 1 auto;
  }
`;

export const TableRoot = styled.div`
  flex: 1 1 auto;
`;

export const TableHeader = styled.div`
  border: 1px solid ${color("border")};
  border-bottom: none;
  border-radius: 0.5rem 0.5rem 0 0;
  background-color: ${color("bg-light")};
`;

export const TableHeaderRow = styled.div`
  display: flex;
  align-items: center;
`;

export const TableHeaderCell = styled.div`
  ${cellStyles};
  color: ${color("text-medium")};
  font-size: 0.6rem;
  letter-spacing: 1px;
  line-height: 0.625rem;
  font-weight: bold;
  text-transform: uppercase;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
`;

export const TableBody = styled.div`
  border: 1px solid ${color("border")};
  border-top: none;
  border-radius: 0 0 0.5rem 0.5rem;
`;

export const TableBodyRow = styled.div`
  display: flex;
  align-items: center;

  &:not(:first-of-type) {
    border-top: 1px solid ${color("border")};
  }
`;

export interface TableBodyCellProps {
  fontWeight?: number;
}

export const TableBodyCell = styled.div<TableBodyCellProps>`
  ${cellStyles};
  color: ${color("text-medium")};
  padding-top: 1rem;
  padding-bottom: 1rem;
  font-weight: ${props => props.fontWeight};
`;

export const TableBodyCellLabel = styled.span`
  color: ${color("text-light")};
  margin-left: 0.25rem;
`;
