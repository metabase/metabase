import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Card from "metabase/components/Card";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Link from "metabase/core/components/Link";
import { Flex, Group, Icon } from "metabase/ui";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { BrowseGrid } from "./BrowseApp.styled";

export const ModelCard = styled(Card)`
  padding: 1.5rem;
  padding-bottom: 1rem;

  height: 9rem;
  display: flex;
  flex-flow: column nowrap;
  justify-content: flex-start;
  align-items: flex-start;

  border: 1px solid ${color("border")};

  box-shadow: none;
  &:hover {
    h1 {
      color: ${color("brand")};
    }
  }
  transition: box-shadow 0.15s;

  h1 {
    transition: color 0.15s;
  }
`;

export const MultilineEllipsified = styled(Ellipsified)`
  white-space: pre-line;
  overflow: hidden;
  text-overflow: ellipsis;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;

  // Without the following rule, the useIsTruncated hook,
  // which Ellipsified calls, might think that this element
  // is truncated when it is not
  padding-bottom: 1px;
`;

export const ModelGrid = styled(BrowseGrid)``;

export const CollectionHeaderContainer = styled(Flex)`
  grid-column: 1 / -1;
  &:not(:first-of-type) {
    border-top: 1px solid #f0f0f0;
  }
`;

export const CollectionHeaderLink = styled(Link)`
  &:hover * {
    color: ${color("brand")};
  }
`;

export const CollectionHeaderGroup = styled(Group)`
  position: relative;
  top: 0.5rem;
`;

export const BannerModelIcon = styled(Icon)`
  color: ${color("text-dark")};
  margin-right: 0.5rem;
  min-width: 16px;
  min-height: 16px;
`;

export const BannerCloseButton = styled(IconButtonWrapper)`
  color: ${color("text-light")};
  margin-left: auto;
`;
