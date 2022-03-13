import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

const CollectionSidebarBookmarksRoot = styled.div`
  margin-top: ${space(2)};
  margin-bottom: ${space(2)};
`;

export const BookmarkTypeIcon = styled(Icon)`
  margin-right: 6px;
  opacity: 0.5;
`;

export const BookmarkLinkRoot = styled.div`
  margin: ${space(1)} 0;
`;

export default CollectionSidebarBookmarksRoot;
