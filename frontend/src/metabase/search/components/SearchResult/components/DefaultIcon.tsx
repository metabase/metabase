import { Icon } from "metabase/core/components/Icon";
import type { IconComponentProps } from "metabase/search/components/SearchResult/components/ItemIcon";
import { DEFAULT_ICON_SIZE } from "./constants";

export function DefaultIcon({ item }: { item: IconComponentProps["item"] }) {
  return <Icon {...item.getIcon()} size={DEFAULT_ICON_SIZE} />;
}
