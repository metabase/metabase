import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

const cellStyles = css`
  display: block;
  padding-left: 1.5rem;
  padding-right: 1.5rem;

  &:first-of-type {
    flex: 0;
    min-width: 12rem;
  }
`;

export const TableRoot = styled.table`
  display: block;
`;

export const TableHeader = styled.thead`
  display: block;
  border: 1px solid ${color("border")};
  border-bottom: none;
  border-radius: 0.5rem 0.5rem 0 0;
  background-color: ${color("bg-light")};
`;

export const TableHeaderRow = styled.tr`
  display: flex;
`;

export const TableHeaderCell = styled.th`
  ${cellStyles};
  color: ${color("text-medium")};
  font-size: 0.5rem;
  line-height: 0.625rem;
  font-weight: bold;
  text-transform: uppercase;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
`;

export const TableBody = styled.tbody`
  display: block;
`;

export const TableBodyRow = styled.tr`
  display: flex;
`;

export const TableBodyCell = styled.td`
  ${cellStyles};
  color: ${color("text-medium")};
  padding-top: 1rem;
  padding-bottom: 1rem;
`;
