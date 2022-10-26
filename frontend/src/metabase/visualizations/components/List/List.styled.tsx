import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

import TableFooter from "../TableSimple/TableFooter";

export const LIST_ITEM_BORDER_DIVIDER_WIDTH = "1";
const LIST_ITEM_BORDER_RADIUS = "6px";

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

export const Footer = styled(TableFooter)`
  margin-top: 0.5rem;
`;

export const ListBody = styled.ul`
  box-shadow: 0px 1px 10px ${color("shadow")};
  border-radius: ${LIST_ITEM_BORDER_RADIUS};
`;

export const ListItemRow = styled.li<{ isClickable?: boolean }>`
  padding: 1rem 2rem;
  cursor: ${props => (props?.isClickable ? "pointer" : "default")};
  width: 100%;
  border-bottom: 1px solid ${color("border")};
  overflow: hidden;
  &:last-child {
    border-bottom: none;
  }
  ${props =>
    props?.isClickable &&
    css`
      &:hover {
        background-color: ${color("bg-medium")};
      }
    `}
`;
