import type { WrappedResult } from "metabase/search/types";

import type { IconComponentProps } from "./ItemIcon";

export const isWrappedResult = (
  item: IconComponentProps["item"],
): item is WrappedResult => item && "getIcon" in item;
