import { Icon } from "metabase/core/components/Icon";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { DEFAULT_ICON_SIZE } from "metabase/search/components/SearchResult/components";
import type { WrappedResult } from "metabase/search/types";

export function CollectionIcon({ item }: { item: WrappedResult }) {
  const iconProps = { ...item.getIcon() };
  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(item.collection);
  if (isRegular) {
    iconProps.size = DEFAULT_ICON_SIZE;
  } else {
    iconProps.width = 20;
    iconProps.height = 24;
  }
  return <Icon {...iconProps} tooltip={null} />;
}
