import { useEffect } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useOmniPickerContext } from "../context";
import { validCollectionModels } from "../utils";

export function useSwitchToSearchFolder() {
  const {
    path,
    setPath,
    searchQuery,
    setPreviousPath,
    previousPath,
    setSearchScope,
  } = useOmniPickerContext();
  const previousSearchQuery = usePrevious(searchQuery);

  useEffect(() => {
    if (searchQuery && searchQuery !== previousSearchQuery) {
      if (path[0]?.id !== "search-results") {
        setPreviousPath(path);
        setSearchScope(null);
      }
      setPath([
        {
          id: "search-results",
          model: "collection",
          name: t`Search results for "${searchQuery}"`,
          below: Array.from(validCollectionModels),
        },
      ]);
    } else if (
      !searchQuery &&
      previousSearchQuery &&
      path[0]?.id === "search-results"
    ) {
      // Restore previous path when clearing search
      if (previousPath.length > 0) {
        setPath(previousPath);
        setPreviousPath([]);
      }
    }
  }, [
    searchQuery,
    previousSearchQuery,
    setPath,
    path,
    previousPath,
    setPreviousPath,
    setSearchScope,
  ]);
}
