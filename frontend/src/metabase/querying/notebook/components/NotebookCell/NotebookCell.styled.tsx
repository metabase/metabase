import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { alpha, color } from "metabase/lib/colors";

export type BorderSide = "top" | "right" | "bottom" | "left";

export const CONTAINER_PADDING = "10px";

export const NotebookCell = styled.div<{ color: string; padding?: string }>`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  border-radius: 8px;
  background-color: ${props => alpha(props.color, 0.1)};
  padding: ${props => props.padding || "14px"};
  color: ${props => props.color};
`;

type NotebookCellItemContainerProps = {
  color: string;
  inactive?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
};

function getNotebookCellItemColor(props: NotebookCellItemContainerProps) {
  if (props.inactive) {
    return props.disabled ? color("text-light") : props.color;
  } else {
    return color("text-white");
  }
}

function getNotebookCellItemBorderColor(props: NotebookCellItemContainerProps) {
  if (props.inactive) {
    return props.disabled ? color("border") : alpha(props.color, 0.25);
  } else {
    return "transparent";
  }
}

export const NotebookCellItemContainer = styled.div<NotebookCellItemContainerProps>`
  display: flex;
  align-items: center;
  font-weight: bold;
  color: ${getNotebookCellItemColor};
  border-radius: 6px;
  border: 2px solid transparent;
  border-color: ${getNotebookCellItemBorderColor};
  cursor: ${props =>
    (!props.inactive || props.onClick) && !props.readOnly && !props.disabled
      ? "pointer"
      : "default"};
  pointer-events: ${props => props.disabled && "none"};

  &:hover {
    border-color: ${props =>
      !props.disabled && props.inactive && alpha(props.color, 0.8)};
  }

  transition: border 300ms linear;

  .Icon-close {
    opacity: 0.6;
  }
`;

export const NotebookCellItemContentContainer = styled.div<{
  color: string;
  inactive?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  border?: BorderSide;
  roundedCorners: BorderSide[];
}>`
  display: flex;
  align-items: center;
  padding: ${CONTAINER_PADDING};
  background-color: ${props =>
    props.inactive
      ? props.disabled
        ? color("bg-light")
        : "transparent"
      : props.color};
  pointer-events: ${props => (props.disabled ? "none" : "auto")};

  &:hover {
    background-color: ${props =>
      !props.inactive &&
      !props.readOnly &&
      !props.disabled &&
      alpha(props.color, 0.8)};
  }

  ${props =>
    !!props.border &&
    css`
    border-${props.border}: 1px solid ${alpha(
      props.theme.fn.themeColor("bg-white"),
      0.25,
    )};
  `}

  ${props =>
    props.roundedCorners.includes("left") &&
    css`
      border-top-left-radius: 6px;
      border-bottom-left-radius: 6px;
    `}

  ${props =>
    props.roundedCorners.includes("right") &&
    css`
      border-top-right-radius: 6px;
      border-bottom-right-radius: 6px;
    `}

  transition: background 300ms linear;
`;
