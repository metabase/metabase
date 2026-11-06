import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import { Box } from "metabase/ui";

type FormulaBarSlotContextValue = {
  slot: HTMLElement | null;
  setSlot: (slot: HTMLElement | null) => void;
  activeOwner: string | null;
  setActiveOwner: Dispatch<SetStateAction<string | null>>;
};

const FormulaBarSlotContext = createContext<FormulaBarSlotContextValue | null>(
  null,
);

export function FormulaBarSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [activeOwner, setActiveOwner] = useState<string | null>(null);
  const value = useMemo(
    () => ({ slot, setSlot, activeOwner, setActiveOwner }),
    [slot, activeOwner],
  );
  return (
    <FormulaBarSlotContext.Provider value={value}>
      {children}
    </FormulaBarSlotContext.Provider>
  );
}

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
