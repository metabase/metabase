import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
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
  display: flex;
  justify-content: space-between;
`;

export const BookmarkButtonWrapper = styled(IconButtonWrapper)`
  color: ${color("brand")};
  margin-right: ${space(1)};
`;

export default CollectionSidebarBookmarksRoot;
