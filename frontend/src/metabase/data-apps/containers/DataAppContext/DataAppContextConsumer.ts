import { useContext } from "react";
import { DataAppContext } from "./DataAppContext";

export const DataAppContextConsumer = DataAppContext.Consumer;

export function useDataAppContext() {
  return useContext(DataAppContext);
}
