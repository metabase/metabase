import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";
import Link from "metabase/core/components/Link";

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
