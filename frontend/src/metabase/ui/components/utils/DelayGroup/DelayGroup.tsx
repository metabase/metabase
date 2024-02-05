import {
  createContext,
  useMemo,
  useState,
  useRef,
  useEffect,
  useContext,
} from "react";

type DelayGroupContext = {
  shouldDelay: boolean;
  onOpen: () => void;
  onClose: () => void;
};

const context = createContext<DelayGroupContext>({
  shouldDelay: true,
  onOpen: () => undefined,
  onClose: () => undefined,
});

type DelayGroupProps = {
  timeout?: number;
  children: React.ReactNode;
};

const DEFAULT_TIMEOUT = 500;

export function DelayGroup({
  children,
  timeout = DEFAULT_TIMEOUT,
}: DelayGroupProps) {
  const [shouldDelay, setShouldDelay] = useState(true);

  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const value = useMemo(
    () => ({
      shouldDelay,
      onOpen() {
        clearTimeout(t.current);
        setShouldDelay(false);
      },
      onClose() {
        clearTimeout(t.current);
        t.current = setTimeout(() => setShouldDelay(true), timeout);
      },
    }),
    [timeout, shouldDelay],
  );

  useEffect(function () {
    return () => clearTimeout(t.current);
  }, []);

  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useDelayGroup(): DelayGroupContext {
  return useContext(context);
}
