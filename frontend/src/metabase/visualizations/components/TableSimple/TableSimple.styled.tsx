import styled from "@emotion/styled";
import { css } from "@emotion/react";

import Icon from "metabase/components/Icon";

import { alpha, color } from "metabase/lib/colors";

export const Root = styled.div`
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

  font-size: 14px;
  line-height: 12px;
  text-align: left;
  thead tr:first-of-type {
    background-color: ${color("white")};
  }
`;

export const Table = styled.table`
  ${standardTableStyleReset}
  tr {
    border-bottom: 1px solid ${alpha(color("border"), 0.3)};
  }
  tr:nth-child(even) {
    background-color: ${color("bg-light")};
  }

  tr:hover {
    background-color: ${color("bg-medium")};
  }

  th,
  td {
    height: 3.1875rem;
    padding: 0 0.75rem;
    border-bottom: 1px solid ${alpha(color("border"), 0.3)};
  }

  th:first-of-type,
  td:first-of-type {
    padding-left: 1.44em;
  }
  td img {
    border-radius: 50%;
    width: 30px;
  }
`;

export const SortIcon = styled(Icon)`
  margin-right: 3px;
`;

SortIcon.defaultProps = {
  size: 8,
};

export const TableHeaderCellContent = styled.button<{
  isSorted: boolean;
  isRightAligned: boolean;
}>`
  display: flex;
  justify-content: ${props =>
    props.isRightAligned ? "space-between" : "flex-start"};
  width: 100%;

  margin-left: ${props => (props.isRightAligned ? "auto" : "unset")};

  color: ${props =>
    props.isSorted ? color("text-medium") : color("text-dark")};
  font-weight: 700;

  cursor: pointer;

  ${SortIcon} {
    opacity: ${props => (props.isSorted ? 1 : 0.2)};
  }

  &:hover {
    color: ${() => color("brand")};
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
    color: ${() => color("brand")};
  }

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `}
`;
