import { createRef, useCallback, useMemo } from "react";

interface UseScrollStepIntoViewResult {
  stepRefs: Record<string, React.RefObject<HTMLDivElement>>;
  handleStepChange: (value: string | null) => void;
}

export function useScrollStepIntoView(
  stepIds: string[],
  onChange?: (value: string | null) => void,
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

  const scrollIntoView = useCallback(
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

  const handleStepChange = useCallback(
    (newValue: string | null) => {
      scrollIntoView(newValue);
      onChange?.(newValue);
    },
    [scrollIntoView, onChange],
  );

  return { stepRefs, handleStepChange };
}
