import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { TreeNode } from "metabase/components/tree/TreeNode";
import Link from "metabase/core/components/Link";
import { alpha, color, darken } from "metabase/lib/colors";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";
import { Icon, Tooltip } from "metabase/ui";

export const SidebarIcon = styled(Icon)<{
  color?: string | null;
  isSelected: boolean;
}>`
  ${props =>
    !props.color &&
    css`
      color: #587330;
    `}
`;

SidebarIcon.defaultProps = {
  size: 16,
};

export const ExpandToggleButton = styled(TreeNode.ExpandToggleButton)`
  padding: 4px 0 4px 2px;
  color: var(--mb-color-brand);
`;

const activeColorCSS = css`
  color: white;
`;

function getTextColor(isSelected: boolean) {
  return isSelected ? color("brand") : darken(color("text-medium"), 0.25);
}

export const NodeRoot = styled(TreeNode.Root)<{
  hasDefaultIconStyle?: boolean;
}>`
  color: ${props => getTextColor(props.isSelected)};
  background-color: ${props => (props.isSelected ? "#D5E3C3" : "unset")};
  padding-left: ${props => props.depth}rem;
  border-radius: 4px;

  ${ExpandToggleButton} {
    ${props => props.isSelected && activeColorCSS}
  }

  &:hover {
    background-color: #587330;
    color: white;

    ${ExpandToggleButton} {
      color: var(--mb-color-brand);
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
  color: var(--mb-color-text-white);
  background-color: var(--mb-color-brand);
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
  color: inherit;
  cursor: pointer;

  ${itemContentStyle}
  ${TreeNode.NameContainer} {
    font-weight: 700;
    color: ${props => (props.isSelected ? color("brand") : "inherit")};
    text-align: start;

    &:hover {
      color: white;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export function NameContainer({ children: itemName }: { children: string }) {
  if (itemName.length >= ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD) {
    return (
      <Tooltip label={itemName} withArrow maw="none">
        <ItemName>{itemName}</ItemName>
      </Tooltip>
    );
  }
  return <TreeNode.NameContainer>{itemName}</TreeNode.NameContainer>;
}

export const LeftElementContainer = styled.div``;
export const RightElementContainer = styled.div``;
