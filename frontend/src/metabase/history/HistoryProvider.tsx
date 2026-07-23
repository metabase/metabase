import { type PropsWithChildren, createContext } from "react";

import type { History } from "metabase/router";

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
