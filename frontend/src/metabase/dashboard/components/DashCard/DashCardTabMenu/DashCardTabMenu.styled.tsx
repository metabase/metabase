import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import { Menu } from "metabase/ui";
import DashCardActionButton from "../DashCardActionButtons/DashCardActionButton";

export const ItemWithMaxWidth = styled(Menu.Item)<
  HTMLAttributes<HTMLButtonElement>
>`
  max-width: 75ch;
  & div {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

/**
 * This is a button with a bigger "hover area" to make it easier
 * for the user to go to the menu without the menu closing.
 */
export const MoveDashCardActionContainer = styled(DashCardActionButton)`
  position: relative;
  &:hover::before {
    content: "";
    position: absolute;
    width: 300%;
    height: 300%;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: -1;
  }
`;
