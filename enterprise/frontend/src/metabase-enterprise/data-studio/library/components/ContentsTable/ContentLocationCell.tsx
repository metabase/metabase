import { skipToken, useGetCollectionQuery } from "metabase/api";
import { Text } from "metabase/ui";
import type { Card } from "metabase-types/api";

import type { ContentOwner } from "./types";
import { isSavedToOwner } from "./utils";

type ContentLocationCellProps = {
  item: Card;
  owner: ContentOwner;
};

export function ContentLocationCell({ item, owner }: ContentLocationCellProps) {
  const isSavedToItsOwner = isSavedToOwner(item, owner);
  const { currentData: collection } = useGetCollectionQuery(
    isSavedToItsOwner ? skipToken : { id: item.collection_id ?? "root" },
  );
  const locationName = isSavedToItsOwner ? owner.name : collection?.name;

  return <Text truncate>{locationName}</Text>;
}
