import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import {
  ROOT_COLLECTION,
  PERSONAL_COLLECTIONS,
} from "metabase/entities/collections";
import { CollectionIcon } from "metabase/collections/components/CollectionIcon";

const { isRegularCollection } = PLUGIN_COLLECTIONS;

import { SIDEBAR_SPACER } from "metabase/collections/constants";
import { color } from "metabase/lib/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

function getOpacity(collection) {
  if (
    collection.id === ROOT_COLLECTION.id ||
    collection.id === PERSONAL_COLLECTIONS.id
  ) {
    return 1;
  }
  return isRegularCollection(collection) ? 0.4 : 1;
}

export const CollectionListIcon = styled(CollectionIcon)`
  margin-right: 6px;
  opacity: ${props => getOpacity(props.collection)};
`;

export const ChildrenContainer = styled.div`
  box-sizing: border-box;
  margin-left: -${SIDEBAR_SPACER}px;
  padding-left: ${SIDEBAR_SPACER + 10}px;
`;

export const ExpandCollectionButton = styled(IconButtonWrapper)`
  align-items: center;
  color: ${color("brand")};
  cursor: pointer;
  left: -20px;
  position: absolute;
`;

export const LabelContainer = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
`;

export const BookmarkCollectionButton = styled(IconButtonWrapper)`
  align-items: center;
  background: ${color("bg-medium")};
  background: linear-gradient(
    90deg,
    ${color("bg-medium")}00 0%,
    ${color("bg-medium")} 30%
  );
  border-radius: 0;
  color: ${color("brand")};
  cursor: pointer;
  height: calc(100% + 16px);
  opacity: 0;
  padding-left: 10px;
  position: absolute;
  right: -8px;
  transition: opacity 0.2s;
  width: 40px;

  ${({ linkIsSelected }) =>
    linkIsSelected &&
    css`
      background: ${color("brand")};
      background: linear-gradient(
        90deg,
        ${color("brand")}00 0%,
        ${color("brand")} 30%
      );
    `};

  ${LabelContainer}:hover & {
    opacity: 1;
  }

  &:hover {
    color: #2e7bbf;
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
