import type { SearchModelType } from "metabase-types/api";
import { IconWrapper } from "metabase/search/components/SearchResult/SearchResult.styled";
import {
  CollectionIcon,
  DefaultIcon,
  TableIcon,
} from "metabase/search/components/SearchResult/components";

import type { WrappedResult } from "metabase/search/types";

const ModelIconComponentMap = {
  table: TableIcon,
  collection: CollectionIcon,
};

export function ItemIcon({
  item,
  type,
  active,
}: {
  item: WrappedResult;
  type: SearchModelType;
  active: boolean;
}) {
  const IconComponent =
    type in Object.keys(ModelIconComponentMap)
      ? ModelIconComponentMap[type as keyof typeof ModelIconComponentMap]
      : DefaultIcon;

  return (
    <IconWrapper item={item} type={type} active={active}>
      <IconComponent item={item} />
    </IconWrapper>
  );
}
