import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

type FormulaBarSlotContextValue = {
  slot: HTMLElement | null;
  setSlot: (slot: HTMLElement | null) => void;
  activeOwner: string | null;
  setActiveOwner: Dispatch<SetStateAction<string | null>>;
};

export const FormulaBarSlotContext =
  createContext<FormulaBarSlotContextValue | null>(null);

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

export function useIsFormulaBarOpen(): boolean {
  return Boolean(useContext(FormulaBarSlotContext)?.activeOwner);
}
