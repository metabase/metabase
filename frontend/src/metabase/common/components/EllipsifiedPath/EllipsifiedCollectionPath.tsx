import {
  getCollectionName,
  getCollectionPath,
  getCollectionPathAsString,
} from "metabase/collections/utils";
import type { CollectionEssentials } from "metabase-types/api";

import { EllipsifiedPath } from "./EllipsifiedPath";

export const EllipsifiedCollectionPath = ({
  collection,
  className,
  ignoreHeightTruncation,
}: {
  collection: CollectionEssentials;
  className?: string;
  ignoreHeightTruncation?: boolean;
}) => {
  return (
    <EllipsifiedPath
      className={className}
      tooltip={getCollectionPathAsString(collection)}
      items={getCollectionPath(collection).map((c) => getCollectionName(c))}
      ignoreHeightTruncation={ignoreHeightTruncation}
    />
  );
};
