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
  toggleSlowState: (forced: boolean) => void;
  slowStateForced: boolean;
}

export const DebugContext = createContext<DebugContextValue>({
  simulateLoad: noop,
  lastLoad: null,
  toggleSlowState: noop,
  slowStateForced: false,
});

export const DebugProvider = ({ children }: PropsWithChildren) => {
  const [lastLoad, setLastLoad] = useState<{ min: number; max: number } | null>(
    null,
  );
  const simulateLoad = useCallback(
    (min: number, max: number) => setLastLoad({ min, max }),
    [],
  );

  const [slowStateForced, toggleSlowState] = useState(false);
  return (
    <DebugContext.Provider
      value={{ simulateLoad, lastLoad, toggleSlowState, slowStateForced }}
    >
      {children}
    </DebugContext.Provider>
  );
};
