import { Icon } from "metabase/core/components/Icon";
import { DEFAULT_ICON_SIZE } from "metabase/search/components/SearchResult/components";
import type { WrappedResult } from "metabase/search/types";

export function DefaultIcon({ item }: { item: WrappedResult }) {
  return <Icon {...item.getIcon()} size={DEFAULT_ICON_SIZE} />;
}
