import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

const CollectionSidebarBookmarksRoot = styled.div`
  margin-bottom: ${space(2)};
`;

interface BookmarkTypeIconProps {
  opacity: number;
}

export const BookmarkTypeIcon = styled(Icon)<BookmarkTypeIconProps>`
  margin-right: 6px;
  opacity: ${({ opacity }) => opacity};
`;

export const BookmarkListRoot = styled.div`
  margin: ${space(2)} 0;
`;

export const BookmarkContainer = styled.div`
  overflow: hidden;
  position: relative;
  width: 100%;

  &:hover {
    background: ${color("bg-medium")};

    button {
      opacity: 0.5;
    }
  }

  button {
    opacity: 0;
    color: ${color("brand")};
    cursor: pointer;
    padding: ${space(1)};
    margin-top: 2px;
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
  }
`;

export default CollectionSidebarBookmarksRoot;
