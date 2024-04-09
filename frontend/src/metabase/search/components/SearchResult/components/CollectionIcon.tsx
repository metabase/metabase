import { color } from "metabase/lib/colors";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { DEFAULT_ICON_SIZE } from "metabase/search/components/SearchResult/components";
import { Icon } from "metabase/ui";

import type { IconComponentProps } from "./ItemIcon";

export function CollectionIcon({ item }: { item: IconComponentProps["item"] }) {
  const iconProps = { ...item.getIcon(), tooltip: null };
  const isRegular =
    "collection" in item &&
    PLUGIN_COLLECTIONS.isRegularCollection(item.collection);

  if (isRegular) {
    return (
      <Icon
        {...iconProps}
        size={DEFAULT_ICON_SIZE}
        color={color("text-light")}
      />
    );
  }

  return <Icon {...iconProps} width={20} height={24} />;
}
