import { createContext, useContext } from "react";

export type PrintContextValue = {
  isPrinting: boolean;
  prepareForPrint: () => Promise<void>;
};

export const PrintContext = createContext<PrintContextValue>({
  isPrinting: false,
  prepareForPrint: async () => {},
});

export function usePrintContext(): PrintContextValue {
  return useContext(PrintContext);
}
