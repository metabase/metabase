import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { Card } from "metabase-types/api";

type XrayEdits = {
  /** Filter and summarize edits to x-ray charts, by selection key (`<tableId>-<position>`). */
  editedCards: Partial<Record<string, Card>>;
  setEditedCard: (selectionKey: string, card: Card) => void;
};

const XrayEditsContext = createContext<XrayEdits | null>(null);

/**
 * Holds edits to x-ray charts for the query builder view, so the header and the chart
 * detail agree on what's shown and edits survive switching between charts.
 */
export function XrayEditsProvider({ children }: { children: ReactNode }) {
  const [editedCards, setEditedCards] = useState<Partial<Record<string, Card>>>(
    {},
  );
  const setEditedCard = useCallback(
    (selectionKey: string, card: Card) =>
      setEditedCards((cards) => ({ ...cards, [selectionKey]: card })),
    [],
  );
  const value = useMemo(
    () => ({ editedCards, setEditedCard }),
    [editedCards, setEditedCard],
  );
  return (
    <XrayEditsContext.Provider value={value}>
      {children}
    </XrayEditsContext.Provider>
  );
}

/** Edits to x-ray charts; without a provider, nothing is edited and edits are dropped. */
export function useXrayEdits(): XrayEdits {
  return useContext(XrayEditsContext) ?? NO_EDITS;
}

const NO_EDITS: XrayEdits = {
  editedCards: {},
  setEditedCard: () => undefined,
};
