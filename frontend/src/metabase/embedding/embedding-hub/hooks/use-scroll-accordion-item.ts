import { createRef, useCallback, useMemo } from "react";

/**
 * Helpful when the checklist is long.
 */
export function useScrollAccordionItemIntoView<K extends string>(itemIds: K[]) {
  const accordionItemRefs = useMemo(() => {
    return itemIds.reduce(
      (refs, itemId) => {
        refs[itemId] = createRef<HTMLDivElement>();

        return refs;
      },
      {} as Record<K, React.RefObject<HTMLDivElement>>,
    );
  }, [itemIds]);

  const isValidAccordionItem = useCallback(
    (key: string | null): key is K => key != null && key in accordionItemRefs,
    [accordionItemRefs],
  );

  const scrollAccordionItemIntoView = (stepId: string | null) => {
    if (isValidAccordionItem(stepId)) {
      const element = accordionItemRefs[stepId].current;

      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return { accordionItemRefs, scrollAccordionItemIntoView };
}
