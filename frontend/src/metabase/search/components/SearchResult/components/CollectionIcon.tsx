import { color } from "metabase/lib/colors";
import { getIcon } from "metabase/lib/icon";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { DEFAULT_ICON_SIZE } from "metabase/search/components/SearchResult/components";
import type { WrappedResult } from "metabase/search/types";
import { Icon } from "metabase/ui";

import type { IconComponentProps } from "./ItemIcon";

const isWrappedResult = (
  item: IconComponentProps["item"],
): item is WrappedResult => item && "getIcon" in item;

export function CollectionIcon({ item }: { item: IconComponentProps["item"] }) {
  const iconData = isWrappedResult(item) ? item?.getIcon?.() : getIcon(item);

  const iconProps = { ...iconData, tooltip: null };
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
