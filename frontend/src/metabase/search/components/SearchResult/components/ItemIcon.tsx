import type { SearchModelType } from "metabase-types/api";
import { IconWrapper } from "metabase/search/components/SearchResult/SearchResult.styled";
import type { WrappedResult } from "metabase/search/types";
import { CollectionIcon } from "./CollectionIcon";
import { DefaultIcon } from "./DefaultIcon";
import { TableIcon } from "./TableIcon";

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
