import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

const CollectionSidebarBookmarksRoot = styled.div`
  margin-bottom: ${space(2)};
`;

export const BookmarkTypeIcon = styled(Icon)`
  margin-right: 6px;
  opacity: 0.5;
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
  }
`;

export const BookmarkButton = styled.button`
  color: ${color("brand")};
  cursor: pointer;
  padding: ${space(1)};
  position: absolute;
  right: 0;
  top: 0;

  &:hover {
    background: ${color("focus")};
  }
`;

export default CollectionSidebarBookmarksRoot;
