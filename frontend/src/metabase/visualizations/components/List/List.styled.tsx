import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { alpha, color } from "metabase/lib/colors";

import TableFooter from "../TableSimple/TableFooter";
import { CellRoot, CellContent } from "./ListCell.styled";

export const LIST_ITEM_BORDER_DIVIDER_WIDTH = "1";

export const Root = styled.div<{ isQueryBuilder?: boolean }>`
  display: flex;
  flex-direction: column;
  position: relative;
  margin: 0.3rem;

  ${props =>
    props.isQueryBuilder &&
    css`
      margin: 2rem 6rem;
    `}
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
  ${standardTableStyleReset};
`;

export const RowActionsContainer = styled.td`
  transition: all 0.1s ease-in-out;
`;

export const BulkSelectionControlContainer = styled(RowActionsContainer)<{
  isSelectingItems?: boolean;
}>`
  padding-left: 6px;

  ${props =>
    props.isSelectingItems &&
    css`
      opacity: 1 !important;
    `}
`;

export const RowActionButtonContainer = styled(CellRoot)`
  padding-left: 0.25rem;
  padding-right: 0.25rem;
`;

export const ListItemContainer = styled.tr<{ disabled?: boolean }>`
  height: 4rem;

  background-color: ${color("bg-white")};

  overflow-x: hidden;

  transition: all 0.1s ease-in-out;

  ${props =>
    !props.disabled &&
    css`
      &:hover {
        cursor: pointer;
        background-color: ${alpha(color("brand"), 0.05)};
      }
    `}

  ${RowActionsContainer}, ${BulkSelectionControlContainer} {
    opacity: 0;
  }

  &:hover {
    ${RowActionsContainer}, ${BulkSelectionControlContainer} {
      opacity: 1;
    }
  }
`;

export const InfoContentContainer = styled.div`
  display: flex;
  flex-direction: column;

  ${CellContent} {
    display: block;
  }

  ${CellContent}:first-of-type {
    font-size: 0.875rem;
  }

  ${CellContent}:last-of-type {
    margin-top: 4px;
    font-size: 0.75rem;
  }
`;

export const TableHeader = styled.thead`
  font-size: 0.8rem;
  color: ${color("text-medium")};

  &:after {
    content: "-";
    display: block;
    line-height: 1em;
    color: transparent;
  }
`;

export const ColumnHeader = styled.th<{ width: string }>`
  padding-left: 0.5rem;
  width: ${props => props.width};
`;

const LIST_ITEM_BORDER_RADIUS = "6px";

export const TableBody = styled.tbody`
  box-shadow: 0px 1px 10px ${color("shadow")};
  border-radius: ${LIST_ITEM_BORDER_RADIUS};

  ${ListItemContainer}:first-of-type td:first-of-type {
    border-top-left-radius: ${LIST_ITEM_BORDER_RADIUS};
  }

  ${ListItemContainer}:first-of-type td:last-of-type {
    border-top-right-radius: ${LIST_ITEM_BORDER_RADIUS};
  }

  ${ListItemContainer}:last-of-type td:first-of-type {
    border-bottom-left-radius: ${LIST_ITEM_BORDER_RADIUS};
  }

  ${ListItemContainer}:last-of-type td:last-of-type {
    border-bottom-right-radius: ${LIST_ITEM_BORDER_RADIUS};
  }

  ${ListItemContainer}:not(:last-of-type) {
    border-bottom: 1px solid ${color("border")};
  }
`;

export const Footer = styled(TableFooter)`
  margin-top: 0.5rem;
`;
