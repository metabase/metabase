import { EntityIcon } from "metabase/common/components/EntityIcon";
import { getIcon } from "metabase/lib/icon";

import type { IconComponentProps } from "./ItemIcon";
import { DEFAULT_ICON_SIZE } from "./constants";

export function DefaultIcon({ item }: { item: IconComponentProps["item"] }) {
  const iconData = getIcon(item);

  return <EntityIcon {...iconData} size={DEFAULT_ICON_SIZE} />;
}
