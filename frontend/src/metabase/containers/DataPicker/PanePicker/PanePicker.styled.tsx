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

export const LeftPaneContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: auto;

  border-right: 1px solid ${color("border")};

  ${Tree.Node.Root} {
    border-radius: 6px;
  }

  ${Tree.NodeList.Root} {
    padding: 0 1rem;
  }
`;

export const BackButton = styled.a`
  display: flex;
  align-items: center;

  color: ${color("text-dark")};
  font-weight: 700;

  margin-left: 1rem;
  padding-bottom: 1rem;

  &:hover {
    color: ${color("brand")};
  }
`;

export const TreeContainer = styled.div``;

export const RightPaneContainer = styled.div`
  display: flex;
  flex: 1;
`;
