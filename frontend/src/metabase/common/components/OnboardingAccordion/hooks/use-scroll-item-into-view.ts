import { createRef, useCallback, useMemo } from "react";

interface UseScrollItemIntoViewResult {
  itemRefs: Record<string, React.RefObject<HTMLDivElement>>;
  handleChange: (value: string | null) => void;
}

export function useScrollItemIntoView(
  stepIds: string[],
  onChange?: (value: string | null) => void,
): UseScrollItemIntoViewResult {
  const itemRefs = useMemo(() => {
    return stepIds.reduce(
      (refs, stepId) => {
        refs[stepId] = createRef<HTMLDivElement>();
        return refs;
      },
      {} as Record<string, React.RefObject<HTMLDivElement>>,
    );
  }, [stepIds]);

  const scrollIntoView = useCallback(
    (stepId: string | null) => {
      if (stepId && itemRefs[stepId]) {
        itemRefs[stepId].current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    },
    [itemRefs],
  );

  const handleChange = useCallback(
    (newValue: string | null) => {
      scrollIntoView(newValue);
      onChange?.(newValue);
    },
    [scrollIntoView, onChange],
  );

  return { itemRefs, handleChange };
}
