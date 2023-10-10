import { Icon } from "metabase/core/components/Icon";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { DEFAULT_ICON_SIZE } from "metabase/search/components/SearchResult/components";
import type { WrappedResult } from "metabase/search/types";

export function CollectionIcon({ item }: { item: WrappedResult }) {
  const iconProps = { ...item.getIcon(), tooltip: null };
  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(item.collection);

  if (isRegular) {
    return <Icon {...iconProps} size={DEFAULT_ICON_SIZE} />;
  }

  return <Icon {...iconProps} width={20} height={24} />;
}
