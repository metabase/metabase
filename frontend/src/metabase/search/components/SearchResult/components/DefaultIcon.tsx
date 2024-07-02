import { getIcon } from "metabase/lib/icon";
import type { WrappedResult } from "metabase/search/types";
import { Icon } from "metabase/ui";

import type { IconComponentProps } from "./ItemIcon";
import { DEFAULT_ICON_SIZE } from "./constants";

const isWrappedResult = (
  item: IconComponentProps["item"],
): item is WrappedResult => item && "getIcon" in item;

export function DefaultIcon({ item }: { item: IconComponentProps["item"] }) {
  const iconData = isWrappedResult(item) ? item?.getIcon?.() : getIcon(item);

  return <Icon {...iconData} size={DEFAULT_ICON_SIZE} />;
}
