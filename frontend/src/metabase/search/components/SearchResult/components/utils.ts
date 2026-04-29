import type { SearchResult } from "metabase-types/api";

import type { IconComponentProps } from "./ItemIcon";

export const isWrappedResult = (
  item: IconComponentProps["item"],
): item is SearchResult => item && "getIcon" in item;
