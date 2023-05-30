import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Link } from "metabase/core/components/Link";

import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";

const { CollectionAuthorityLevelIcon } = PLUGIN_COLLECTION_COMPONENTS;

export const CollectionBadgeRoot = styled.div`
  display: inline-block;
`;

export const CollectionLink = styled(Link)`
  display: flex;
  align-items: center;
  text-decoration: dashed;
  &:hover {
    color: ${color("brand")};
  }
`;

export const AuthorityLevelIcon = styled(CollectionAuthorityLevelIcon)`
  padding-right: 2px;
`;

AuthorityLevelIcon.defaultProps = {
  size: 13,
};
