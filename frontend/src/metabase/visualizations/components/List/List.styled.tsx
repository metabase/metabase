import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { alpha, color } from "metabase/lib/colors";

import TableFooter from "../TableSimple/TableFooter";
import { CellRoot } from "./ListCell.styled";

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

export const RowActionsContainer = styled.div`
  display: flex;
  align-items: center;
  transition: all 0.1s ease-in-out;
`;

export const BulkSelectionControlContainer = styled(RowActionsContainer)<{
  isSelectingItems?: boolean;
}>`
  ${props =>
    props.isSelectingItems &&
    css`
      width: 100% !important;
      opacity: 1 !important;
    `}
`;

export const RowActionButtonContainer = styled(CellRoot)`
  padding-left: 0.25rem;
  padding-right: 0.25rem;
`;

export const ListItemContainer = styled.div<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4rem;

  background-color: ${color("bg-white")};

  overflow-x: hidden;

  transition: all 0.1s ease-in-out;

  padding: 1.1875rem 1rem;

  ${props =>
    !props.disabled &&
    css`
      &:hover {
        cursor: pointer;
        background-color: ${alpha(color("brand"), 0.05)};
      }
    `}

  ${RowActionsContainer}, ${BulkSelectionControlContainer} {
    width: 0;
    opacity: 0;
  }

  &:hover {
    ${RowActionsContainer}, ${BulkSelectionControlContainer} {
      width: 100%;
      opacity: 1;
    }
  }
`;

export const ListItemContent = styled.div`
  display: flex;
  align-items: center;
`;

export const InfoContentContainer = styled.div`
  ${CellRoot}:last-of-type {
    margin-top: 2px;
    font-size: 0.75rem;
  }
`;

const LIST_ITEM_BORDER_RADIUS = "6px";

// Adding horizontal margin so list item shadows don't get cut in dashboard cards
// Because of overflow: hidden style. We need overflow-y: hidden to limit the number of visible rows
// And it's impossible to combine overflow-x: visible with overflow-y: hidden
// https://stackoverflow.com/questions/6421966/css-overflow-x-visible-and-overflow-y-hidden-causing-scrollbar-issue
export const ContentContainer = styled.div`
  box-shadow: 0px 1px 10px ${color("shadow")};
  border: 1px solid ${color("border")};
  border-radius: ${LIST_ITEM_BORDER_RADIUS};

  ${ListItemContainer}:first-of-type {
    border-top-left-radius: ${LIST_ITEM_BORDER_RADIUS};
    border-top-right-radius: ${LIST_ITEM_BORDER_RADIUS};
  }

  ${ListItemContainer}:last-of-type {
    border-bottom-left-radius: ${LIST_ITEM_BORDER_RADIUS};
    border-bottom-right-radius: ${LIST_ITEM_BORDER_RADIUS};
  }

  ${ListItemContainer}:not(:last-of-type) {
    border-bottom: 1px solid ${color("border")};
  }
`;

export const Footer = styled(TableFooter)`
  margin-top: 0.5rem;
`;
