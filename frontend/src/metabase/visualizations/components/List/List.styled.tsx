import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

import TableFooter from "../TableSimple/TableFooter";
import { CellRoot } from "./ListCell.styled";

export const LIST_ITEM_VERTICAL_GAP = "16px";

export const Root = styled.div<{ isQueryBuilder?: boolean }>`
  display: flex;
  flex-direction: column;
  position: relative;

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

export const RowActionButtonContainer = styled(CellRoot)`
  padding-left: 0.25rem;
  padding-right: 0.25rem;
`;

export const ListItemContainer = styled.div<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4rem;
  border-radius: 8px;
  box-shadow: 2px 3px 5px ${color("shadow")};
  border: 1px solid transparent;

  padding: 0 0.5rem;

  background-color: ${color("bg-white")};

  transition: all 0.1s ease-in-out;

  ${props =>
    !props.disabled &&
    css`
      &:hover {
        cursor: pointer;
        border-color: ${color("border")};
      }
    `}

  ${RowActionsContainer} {
    width: 0;
    opacity: 0;
  }

  &:hover {
    ${RowActionsContainer} {
      width: 100%;
      opacity: 1;
    }
  }
`;

export const ListItemContent = styled.div`
  display: flex;
  align-items: center;
`;

// Adding horizontal margin so list item shadows don't get cut in dashboard cards
// Because of overflow: hidden style. We need overflow-y: hidden to limit the number of visible rows
// And it's impossible to combine overflow-x: visible with overflow-y: hidden
// https://stackoverflow.com/questions/6421966/css-overflow-x-visible-and-overflow-y-hidden-causing-scrollbar-issue
export const ContentContainer = styled.div`
  margin: 0 0.3rem;

  ${ListItemContainer}:not(:first-of-type) {
    margin-top: ${LIST_ITEM_VERTICAL_GAP};
  }
`;

export const Footer = styled(TableFooter)`
  margin-top: 0.5rem;
`;
