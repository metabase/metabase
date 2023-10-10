import { Icon } from "metabase/core/components/Icon";
import type { WrappedResult } from "metabase/search/types";
import { DEFAULT_ICON_SIZE } from "./constants";

export function DefaultIcon({ item }: { item: WrappedResult }) {
  return <Icon {...item.getIcon()} size={DEFAULT_ICON_SIZE} />;
}
