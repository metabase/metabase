import { useCallback, useContext, useEffect, useId } from "react";

import { Box } from "metabase/ui";

import { FormulaBarSlotContext } from "./context";

export function FormulaBarSlotTarget({ className }: { className?: string }) {
  const context = useContext(FormulaBarSlotContext);
  if (context == null) {
    return null;
  }
  return (
    <Box
      ref={context.setSlot}
      className={className}
      data-testid="formula-bar-slot"
    />
  );
}

export function useFormulaBarSlot(): HTMLElement | null {
  return useContext(FormulaBarSlotContext)?.slot ?? null;
}

export function useFormulaBarOwnership() {
  const owner = useId();
  const context = useContext(FormulaBarSlotContext);
  const setActiveOwner = context?.setActiveOwner;
  const open = useCallback(
    () => setActiveOwner?.(owner),
    [owner, setActiveOwner],
  );
  const close = useCallback(
    () =>
      setActiveOwner?.((activeOwner) =>
        activeOwner === owner ? null : activeOwner,
      ),
    [owner, setActiveOwner],
  );

  useEffect(() => close, [close]);

  return { isActive: context?.activeOwner === owner, open, close };
}
