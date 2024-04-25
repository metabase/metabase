import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Tree } from "metabase/components/tree";
import { color } from "metabase/lib/colors";
import { breakpointMaxSmall } from "metabase/styled-components/theme/media-queries";

export const Root = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;

  ${breakpointMaxSmall} {
    flex-direction: column;
    overflow: auto;
  }
`;

export const LeftPaneContainer = styled.div<{ hasContent?: boolean }>`
  display: flex;
  flex-direction: column;
  overflow: auto;

  ${({ hasContent }) =>
    hasContent &&
    css`
      flex: 1;
      border-right: 1px solid ${color("border")};
    `}

  ${Tree.Node.Root} {
    border-radius: 6px;
  }
`;

export const BackButton = styled.button`
  display: flex;
  align-items: center;
  cursor: pointer;

  color: ${color("text-dark")};
  font-weight: 700;

  padding-bottom: 1rem;

  &:hover {
    color: ${color("brand")};
  }
`;

export const TreeContainer = styled.div`
  margin-right: 1rem;
`;

export const RightPaneContainer = styled.div`
  display: flex;
  flex: 1;
  overflow-y: auto;
`;
