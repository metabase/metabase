import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useState,
} from "react";
import { noop } from "underscore";

interface DebugContextValue {
  simulateLoad: (min: number, max: number) => void;
  lastLoad: { min: number; max: number } | null;
}

export const DebugContext = createContext<DebugContextValue>({
  simulateLoad: noop,
  lastLoad: null,
});

export const DebugProvider = ({ children }: PropsWithChildren) => {
  const [lastLoad, setLastLoad] = useState<{ min: number; max: number } | null>(
    null,
  );
  const simulateLoad = useCallback(
    (min: number, max: number) => setLastLoad({ min, max }),
    [],
  );
  return (
    <DebugContext.Provider value={{ simulateLoad, lastLoad }}>
      {children}
    </DebugContext.Provider>
  );
};
