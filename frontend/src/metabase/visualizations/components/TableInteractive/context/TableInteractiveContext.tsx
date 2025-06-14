import { createContext, useContext } from "react";

import type { ClickObject } from "metabase-lib/types";

interface TableInteractiveContextType {
  clicked?: ClickObject | null;
}

export const TableInteractiveContext =
  createContext<TableInteractiveContextType>({});

export const useTableInteractiveContext = () =>
  useContext(TableInteractiveContext);
