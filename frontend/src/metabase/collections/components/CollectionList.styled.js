import styled from "styled-components";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import {
  ROOT_COLLECTION,
  PERSONAL_COLLECTIONS,
} from "metabase/entities/collections";
import { CollectionIcon } from "metabase/collections/components/CollectionIcon";

const { isRegularCollection } = PLUGIN_COLLECTIONS;

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
