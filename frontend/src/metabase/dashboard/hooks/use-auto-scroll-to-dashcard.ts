import { useCallback, useMemo } from "react";

import type { Path } from "metabase/router";
import { useNavigate } from "metabase/router";
import { parseHashOptions, stringifyHashOptions } from "metabase/utils/browser";
import type { DashCardId } from "metabase-types/api";

export interface UseAutoScrollToDashcardResult {
  autoScrollToDashcardId: DashCardId | undefined;
  reportAutoScrolledToDashcard: () => void;
}

export const useAutoScrollToDashcard = (
  location: Partial<Path>,
): UseAutoScrollToDashcardResult => {
  const navigate = useNavigate();

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
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: hash ? "#" + hash : "",
      },
      { replace: true },
    );
  }, [hashOptions, location.pathname, location.search, navigate]);

  return {
    autoScrollToDashcardId,
    reportAutoScrolledToDashcard,
  };
};
