import { createRef, useCallback, useMemo } from "react";

interface UseScrollStepIntoViewResult {
  stepRefs: Record<string, React.RefObject<HTMLDivElement>>;
  scrollStepIntoView: (stepId: string | null) => void;
}

/**
 * Creates refs for each step and provides a function to scroll a step into view.
 * Used to smoothly scroll the active step into the viewport when it changes.
 */
export function useScrollStepIntoView(
  stepIds: string[],
): UseScrollStepIntoViewResult {
  const stepRefs = useMemo(() => {
    return stepIds.reduce(
      (refs, stepId) => {
        refs[stepId] = createRef<HTMLDivElement>();
        return refs;
      },
      {} as Record<string, React.RefObject<HTMLDivElement>>,
    );
  }, [stepIds]);

  const scrollStepIntoView = useCallback(
    (stepId: string | null) => {
      if (stepId && stepRefs[stepId]) {
        stepRefs[stepId].current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    },
    [stepRefs],
  );

  return { stepRefs, scrollStepIntoView };
}
