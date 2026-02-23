import type { LocationDescriptorObject } from "history";
import { useCallback, useMemo } from "react";

import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { useNavigation } from "metabase/routing";
import type { DashCardId } from "metabase-types/api";

export interface UseAutoScrollToDashcardResult {
  autoScrollToDashcardId: DashCardId | undefined;
  reportAutoScrolledToDashcard: () => void;
}

export const useAutoScrollToDashcard = (
  location: LocationDescriptorObject,
): UseAutoScrollToDashcardResult => {
  const { replace } = useNavigation();

  const hashOptions = useMemo(() => {
    if (!location.hash) {
      return {};
    }
    return parseHashOptions(location.hash);
  }, [location.hash]);

  const autoScrollToDashcardId = useMemo(() => {
    return typeof hashOptions.scrollTo === "number"
      ? hashOptions.scrollTo
      : undefined;
  }, [hashOptions.scrollTo]);

  const reportAutoScrolledToDashcard = useCallback(() => {
    // clear out the scrollTo hash param to avoid repeatedly auto-scrolling
    // if the dashcard is unmounted then remounted
    const { scrollTo, ...restHashOptions } = hashOptions;
    const hash = stringifyHashOptions(restHashOptions);
    replace({
      pathname: location.pathname,
      search: location.search,
      hash: hash ? "#" + hash : "",
    });
  }, [hashOptions, replace, location.pathname, location.search]);

  return {
    autoScrollToDashcardId,
    reportAutoScrolledToDashcard,
  };
};
