import { type ReactNode, createContext, useContext } from "react";

import type { DataGridTheme } from "metabase/data-grid/types";

const DataGridThemeContext = createContext<DataGridTheme | undefined>(
  undefined,
);

interface DataGridThemeProviderProps {
  children: ReactNode;
  theme?: DataGridTheme;
}

export function DataGridThemeProvider({
  children,
  theme,
}: DataGridThemeProviderProps) {
  return (
    <DataGridThemeContext.Provider value={theme}>
      {children}
    </DataGridThemeContext.Provider>
  );
}

export function useDataGridTheme(): DataGridTheme | undefined {
  return useContext(DataGridThemeContext);
}
