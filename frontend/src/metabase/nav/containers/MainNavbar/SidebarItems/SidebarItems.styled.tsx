import React from "react";
import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { TreeNode } from "metabase/components/tree/TreeNode";
import Tooltip from "metabase/components/Tooltip";
import Link from "metabase/core/components/Link";

import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

import { color } from "metabase/lib/colors";

export const NodeRoot = styled(TreeNode.Root)<{ hovered?: boolean }>`
  ${props =>
    props.hovered &&
    css`
      color: ${color("text-white")};
      background-color: ${color("brand")};
    `}
`;

export const FullWidthLink = styled(Link)`
  display: flex;
  align-items: center;
  width: 100%;
`;

const ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD = 35;
const ITEM_NAME_LABEL_WIDTH = Math.round(parseInt(NAV_SIDEBAR_WIDTH, 10) * 0.7);

const ItemName = styled(TreeNode.NameContainer)`
  width: ${ITEM_NAME_LABEL_WIDTH}px;
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
