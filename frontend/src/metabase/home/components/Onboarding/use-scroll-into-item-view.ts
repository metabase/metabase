import { useEffect } from "react";

import type { ChecklistItemValue } from "metabase/redux/store";

import type { createItemsRefs } from "./utils";

/** Mantine's own default; restated here so the scroll can wait exactly that long. */
const ACCORDION_TRANSITION_DURATION = 200;

const scrollElementIntoView = (element?: HTMLDivElement | null) => {
  element?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
};

export const useScrollIntoItemView = (
  itemsRefs: ReturnType<typeof createItemsRefs>,
  lastItemOpened: ChecklistItemValue | undefined,
) => {
  useEffect(() => {
    if (!lastItemOpened || !(lastItemOpened in itemsRefs)) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollElementIntoView(itemsRefs[lastItemOpened].current);
    }, ACCORDION_TRANSITION_DURATION);

    return () => clearTimeout(timeout);
  }, [itemsRefs, lastItemOpened]);
};
