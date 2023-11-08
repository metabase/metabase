import styled from "styled-components";
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
`;
