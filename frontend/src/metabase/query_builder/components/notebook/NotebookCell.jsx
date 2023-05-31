/* eslint-disable react/prop-types */
import { isValidElement } from "react";

import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { Icon } from "metabase/core/components/Icon";

import { alpha } from "metabase/lib/colors";

const CONTAINER_PADDING = "10px";

const _NotebookCell = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  border-radius: 8px;
  background-color: ${props => alpha(props.color, 0.1)};
  padding: ${props => props.padding || "14px"};
  color: ${props => props.color};
`;

export const NotebookCell = Object.assign(_NotebookCell, {
  displayName: "NotebookCell",
  CONTAINER_PADDING,
});

const NotebookCellItemContainer = styled.div`
  display: flex;
  align-items: center;
  font-weight: bold;
  color: ${props => (props.inactive ? props.color : "white")};
  border-radius: 6px;
  margin-right: 4px;

  border: 2px solid transparent;
  border-color: ${props =>
    props.inactive ? alpha(props.color, 0.25) : "transparent"};

  &:hover {
    border-color: ${props => props.inactive && alpha(props.color, 0.8)};
  }

  transition: border 300ms linear;

  .Icon-close {
    opacity: 0.6;
  }
`;

const NotebookCellItemContentContainer = styled.div`
  display: flex;
  align-items: center;
  padding: ${CONTAINER_PADDING};
  background-color: ${props => (props.inactive ? "transparent" : props.color)};

  &:hover {
    background-color: ${props => !props.inactive && alpha(props.color, 0.8)};
  }

  ${props =>
    !!props.border &&
    css`
    border-${props.border}: 1px solid ${alpha("white", 0.25)};
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

export function NotebookCellItem(props) {
  const {
    inactive,
    color,
    containerStyle,
    right,
    rightContainerStyle,
    children,
    readOnly,
    ...restProps
  } = props;

  const hasRightSide = isValidElement(right) && !readOnly;
  const mainContentRoundedCorners = ["left"];
  if (!hasRightSide) {
    mainContentRoundedCorners.push("right");
  }
  return (
    <NotebookCellItemContainer
      inactive={inactive}
      color={color}
      {...restProps}
      data-testid={props["data-testid"] ?? "notebook-cell-item"}
    >
      <NotebookCellItemContentContainer
        inactive={inactive}
        color={color}
        roundedCorners={mainContentRoundedCorners}
        style={containerStyle}
      >
        {children}
      </NotebookCellItemContentContainer>
      {hasRightSide && (
        <NotebookCellItemContentContainer
          inactive={inactive}
          color={color}
          border="left"
          roundedCorners={["right"]}
          style={rightContainerStyle}
        >
          {right}
        </NotebookCellItemContentContainer>
      )}
    </NotebookCellItemContainer>
  );
}

NotebookCellItem.displayName = "NotebookCellItem";

export const NotebookCellAdd = ({ initialAddText, ...props }) => (
  <NotebookCellItem {...props} inactive={!!initialAddText}>
    {initialAddText || <Icon name="add" className="text-white" />}
  </NotebookCellItem>
);

NotebookCellAdd.displayName = "NotebookCellAdd";
