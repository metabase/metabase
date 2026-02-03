import { getIcon } from "metabase/lib/icon";
import { Icon } from "metabase/ui";

import type { IconComponentProps } from "./ItemIcon";
import { DEFAULT_ICON_SIZE } from "./constants";

export function DefaultIcon({ item }: { item: IconComponentProps["item"] }) {
  const iconData = getIcon(item);

  return <Icon {...iconData} size={DEFAULT_ICON_SIZE} />;
}
