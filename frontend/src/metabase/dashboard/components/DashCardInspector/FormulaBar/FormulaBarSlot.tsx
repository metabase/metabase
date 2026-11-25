import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import { Box } from "metabase/ui";

type FormulaBarSlotContextValue = {
  slot: HTMLElement | null;
  setSlot: (slot: HTMLElement | null) => void;
};

const FormulaBarSlotContext = createContext<FormulaBarSlotContextValue | null>(
  null,
);

/**
 * Shares one spot across the top of the workspace where formula bars render: the summary
 * sidebar's, and the one the results table's add-column button opens.
 */
export function FormulaBarSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return (
    <FormulaBarSlotContext.Provider value={value}>
      {children}
    </FormulaBarSlotContext.Provider>
  );
}

/** Where formula bars land. Renders nothing outside a `FormulaBarSlotProvider`. */
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

/** The element formula bars portal into; `null` until it mounts, or without a provider. */
export function useFormulaBarSlot(): HTMLElement | null {
  return useContext(FormulaBarSlotContext)?.slot ?? null;
}
