import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { TreeNode } from "metabase/components/tree/TreeNode";
import Link from "metabase/core/components/Link";

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
