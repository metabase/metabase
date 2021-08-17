/* eslint-disable react/prop-types */
import React from "react";

import { Flex } from "grid-styled";
import styled, { css } from "styled-components";

import Icon from "metabase/components/Icon";

import { alpha } from "metabase/lib/colors";

export const NotebookCell = styled(Flex).attrs({
  align: "center",
  flexWrap: "wrap",
})`
  border-radius: 8px;
  background-color: ${props => alpha(props.color, 0.1)};
  padding: 14px;
`;

NotebookCell.displayName = "NotebookCell";

const NotebookCellItemContainer = styled(Flex).attrs({ align: "center" })`
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
  padding: 10px;
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

export function NotebookCellItem({
  inactive,
  color,
  right,
  rightContainerStyle,
  children,
  ...props
}) {
  const hasRightSide = React.isValidElement(right);
  const mainContentRoundedCorners = ["left"];
  if (!hasRightSide) {
    mainContentRoundedCorners.push("right");
  }
  return (
    <NotebookCellItemContainer inactive={inactive} color={color} {...props}>
      <NotebookCellItemContentContainer
        inactive={inactive}
        color={color}
        roundedCorners={mainContentRoundedCorners}
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

export const NotebookCellAdd = styled(NotebookCellItem).attrs({
  inactive: ({ initialAddText }) => initialAddText,
  // eslint-disable-next-line react/display-name
  children: ({ initialAddText }) =>
    initialAddText || <Icon name="add" className="text-white" />,
})``;

NotebookCellAdd.displayName = "NotebookCellAdd";
