import styled from "styled-components";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { CollectionIcon } from "metabase/collections/components/CollectionIcon";

const { isRegularCollection } = PLUGIN_COLLECTIONS;

function getOpacity(collection) {
  return isRegularCollection(collection) ? 0.4 : 1;
}

export const CollectionListIcon = styled(CollectionIcon)`
  margin-right: 6px;
  opacity: ${props => getOpacity(props.collection)};
`;
