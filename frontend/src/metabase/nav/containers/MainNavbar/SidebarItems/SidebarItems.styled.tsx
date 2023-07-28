import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { Icon } from "metabase/core/components/Icon";
import { TreeNode } from "metabase/components/tree/TreeNode";
import Tooltip from "metabase/core/components/Tooltip";
import Link from "metabase/core/components/Link";

import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

import { alpha, color, darken } from "metabase/lib/colors";

export const SidebarIcon = styled(Icon)<{
  color?: string | null;
  isSelected: boolean;
}>`
  ${props =>
    !props.color &&
    css`
      color: ${color("brand")};
    `}
`;

SidebarIcon.defaultProps = {
  size: 16,
};

export const ExpandToggleButton = styled(TreeNode.ExpandToggleButton)`
  padding: 4px 0 4px 2px;
  color: ${color("brand")};
`;

const activeColorCSS = css`
  color: ${color("brand")};
`;

function getTextColor(isSelected: boolean) {
  return isSelected ? color("brand") : darken(color("text-medium"), 0.25);
}

export const NodeRoot = styled(TreeNode.Root)<{
  hasDefaultIconStyle?: boolean;
}>`
  color: ${props => getTextColor(props.isSelected)};

  background-color: ${props =>
    props.isSelected ? alpha("brand", 0.2) : "unset"};

  padding-left: ${props => props.depth}rem;
  border-radius: 4px;

  ${ExpandToggleButton} {
    ${props => props.isSelected && activeColorCSS}
  }

  &:hover {
    background-color: ${alpha("brand", 0.35)};
    color: ${color("brand")};

    ${ExpandToggleButton} {
      color: ${color("brand")};
    }

    ${SidebarIcon} {
      ${props => props.hasDefaultIconStyle && activeColorCSS};
    }
  }
`;

NodeRoot.defaultProps = {
  hasDefaultIconStyle: true,
};

export const collectionDragAndDropHoverStyle = css`
  color: ${color("text-white")};
  background-color: ${color("brand")};
`;

export const CollectionNodeRoot = styled(NodeRoot)<{ hovered?: boolean }>`
  ${props => props.hovered && collectionDragAndDropHoverStyle}
`;

const itemContentStyle = css`
  display: flex;
  align-items: center;
  width: 100%;
`;

export const FullWidthButton = styled.button<{ isSelected: boolean }>`
  cursor: pointer;

  ${itemContentStyle}
  ${TreeNode.NameContainer} {
    font-weight: 700;
    color: ${props => getTextColor(props.isSelected)};
    text-align: start;

    &:hover {
      color: ${color("brand")};
    }
  }
`;

export const FullWidthLink = styled(Link)`
  ${itemContentStyle}
`;

const ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD = 35;
const ITEM_NAME_LABEL_WIDTH = Math.round(parseInt(NAV_SIDEBAR_WIDTH, 10) * 0.7);

export const ItemName = styled(TreeNode.NameContainer)`
  width: ${ITEM_NAME_LABEL_WIDTH}px;
  padding: 6px 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export function NameContainer({ children: itemName }: { children: string }) {
  if (itemName.length >= ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD) {
    return (
      <Tooltip tooltip={itemName} maxWidth="none">
        <ItemName>{itemName}</ItemName>
      </Tooltip>
    );
  }
  return <TreeNode.NameContainer>{itemName}</TreeNode.NameContainer>;
}

export const LeftElementContainer = styled.div``;
export const RightElementContainer = styled.div``;
