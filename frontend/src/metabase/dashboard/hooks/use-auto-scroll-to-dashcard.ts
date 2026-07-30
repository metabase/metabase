import { useCallback, useMemo } from "react";

import { useDispatch, useSelector } from "metabase/redux";
import type { LocationDescriptorObject } from "metabase/router";
import { replace } from "metabase/router";
import { parseHashOptions, stringifyHashOptions } from "metabase/utils/browser";
import type { DashCardId } from "metabase-types/api";
import { isBaseEntityID } from "metabase-types/api";

import { getDashcards } from "../selectors";

export interface UseAutoScrollToDashcardResult {
  autoScrollToDashcardId: DashCardId | undefined;
  reportAutoScrolledToDashcard: () => void;
}

export const useAutoScrollToDashcard = (
  location: LocationDescriptorObject,
): UseAutoScrollToDashcardResult => {
  const dispatch = useDispatch();
  const dashcards = useSelector(getDashcards);

  const hashOptions = useMemo(() => {
    if (!location.hash) {
      return {};
    }
    return parseHashOptions(location.hash);
  }, [location.hash]);

  const autoScrollToDashcardId = useMemo(() => {
    const { scrollTo } = hashOptions;
    if (typeof scrollTo === "number") {
      return scrollTo;
    }
    // A `#scrollTo=` entity_id is resolved to its dashcard's numeric ID against
    // the already-loaded dashcards
    if (isBaseEntityID(scrollTo)) {
      return Object.values(dashcards).find(
        (dashcard) => dashcard.entity_id === scrollTo,
      )?.id;
    }
    return undefined;
  }, [hashOptions, dashcards]);

  const reportAutoScrolledToDashcard = useCallback(() => {
    // clear out the scrollTo hash param to avoid repeatedly auto-scrolling
    // if the dashcard is unmounted then remounted
    const { scrollTo, ...restHashOptions } = hashOptions;
    const hash = stringifyHashOptions(restHashOptions);
    dispatch(
      replace({
        pathname: location.pathname,
        search: location.search,
        hash: hash ? "#" + hash : "",
      }),
    );
  }, [hashOptions, dispatch, location.pathname, location.search]);

  return {
    autoScrollToDashcardId,
    reportAutoScrolledToDashcard,
  };
};
