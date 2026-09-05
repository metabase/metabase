import { useEffect } from "react";

import type { ChecklistItemValue } from "metabase/redux/store";

import type { createItemsRefs } from "./utils";

/**
 * Also handed to the `Accordion`, so the wait below and the expand animation it
 * is waiting on cannot drift apart.
 */
export const ACCORDION_TRANSITION_DURATION = 200;

export const useScrollIntoItemView = (
  itemsRefs: ReturnType<typeof createItemsRefs>,
  lastItemOpened: ChecklistItemValue | undefined,
) => {
  useEffect(() => {
    // The remembered item may have no ref: it can be hidden by permissions or
    // by a setting, in which case there is nothing on the page to scroll to.
    if (!lastItemOpened || !(lastItemOpened in itemsRefs)) {
      return;
    }

    const timeout = setTimeout(() => {
      itemsRefs[lastItemOpened].current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, ACCORDION_TRANSITION_DURATION);

    return () => clearTimeout(timeout);
  }, [itemsRefs, lastItemOpened]);
};
