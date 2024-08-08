import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { alpha, color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";
import { TableRoot } from "metabase/visualizations/components/TableRoot";

export const Root = styled(TableRoot)`
  display: flex;
  flex-direction: column;
  position: relative;
`;

export const ContentContainer = styled.div`
  position: relative;
  flex: 1 0 auto;
`;

export const TableContainer = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  overflow-x: auto;
  overflow-y: hidden;
`;

const standardTableStyleReset = css`
  border-collapse: collapse;
  border-spacing: 0;
  width: 100%;
  font-size: 12px;
  line-height: 12px;
  text-align: left;
`;

export const Table = styled.table`
  ${standardTableStyleReset}

  tr {
    border-bottom: 1px solid ${alpha(color("border"), 0.3)};
  }

  th,
  td {
    height: 2.1875rem;
    padding: 0 0.75rem;
    border-bottom: 1px solid ${alpha(color("border"), 0.3)};
  }

  th:first-of-type,
  td:first-of-type {
    padding-left: 1.44em;
  }
`;

export const SortIcon = styled(Icon)`
  margin: 4px;
`;

SortIcon.defaultProps = {
  size: 8,
};

export const TableHeaderCellContent = styled.button<{
  isSorted: boolean;
  isRightAligned: boolean;
}>`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  flex-direction: ${props => (props.isRightAligned ? "row-reverse" : "row")};
  color: ${props => (props.isSorted ? color("brand") : color("text-medium"))};
  font-weight: 700;
  cursor: pointer;

  ${SortIcon} {
    opacity: ${props => (props.isSorted ? 1 : 0.5)};
  }

  &:hover {
    color: ${color("brand")};
  }
`;

export const TableFooterRoot = styled.div`
  display: flex;
  flex-shrink: 0;
  padding: 0.5rem;
  margin-left: auto;
`;

export const PaginationMessage = styled.span`
  font-weight: bold;
`;

export const PaginationButton = styled.button<{
  direction: "next" | "previous";
}>`
  padding-left: ${props =>
    props.direction === "previous" ? "0.5rem" : "unset"};
  padding-right: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `}
`;
