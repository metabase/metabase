import {
  getCollectionName,
  getCollectionPath,
  getCollectionPathAsString,
} from "metabase/collections/utils";
import type { CollectionEssentials } from "metabase-types/api";

import { EllipsifiedPath } from "./EllipsifiedPath";

export const EllipsifiedCollectionPath = ({
  collection,
}: {
  collection: CollectionEssentials;
}) => {
  return (
    <EllipsifiedPath
      tooltip={getCollectionPathAsString(collection)}
      items={getCollectionPath(collection).map(c => getCollectionName(c))}
    />
  );
};
