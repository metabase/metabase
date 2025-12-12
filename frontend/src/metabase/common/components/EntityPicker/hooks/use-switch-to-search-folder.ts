import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useOmniPickerContext } from "../context";
import type { OmniPickerItem } from "../types";
import { validCollectionModels } from "../utils";

export function useSwitchToSearchFolder() {
  const { path, setPath, searchQuery } = useOmniPickerContext();
  const previousSearchQuery = usePrevious(searchQuery);
  const pathCache = useRef<OmniPickerItem[] | null>(null);

  useEffect(() => {
    if (searchQuery && searchQuery !== previousSearchQuery) {
      if (path[0]?.id !== "search-results") {
        pathCache.current = path; // cache old path
      }
      setPath([{
        id: "search-results",
        model: "collection",
        name: t`Search results for "${searchQuery}"`,
        below: Array.from(validCollectionModels),
      }]);
    } else if (!searchQuery && previousSearchQuery) {
      // Restore previous path when clearing search
      if (pathCache.current) {
        setPath(pathCache.current);
        pathCache.current = null;
      }
    }
  }, [searchQuery, previousSearchQuery, setPath, path]);
}
