import { Icon } from "metabase/ui";

import type { IconComponentProps } from "./ItemIcon";
import { DEFAULT_ICON_SIZE } from "./constants";

export function DefaultIcon({ item }: { item: IconComponentProps["item"] }) {
  return <Icon {...item.getIcon()} size={DEFAULT_ICON_SIZE} />;
}
