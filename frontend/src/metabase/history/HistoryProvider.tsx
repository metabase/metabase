import type { History } from "history";
import { type PropsWithChildren, createContext } from "react";

type HistoryContextType = {
  history: History;
};

export const HistoryContext = createContext<HistoryContextType | null>(null);

type Props = {
  history: History;
};

export const HistoryProvider = ({
  history,
  children,
}: PropsWithChildren<Props>) => {
  return (
    <HistoryContext.Provider value={{ history }}>
      {children}
    </HistoryContext.Provider>
  );
};
