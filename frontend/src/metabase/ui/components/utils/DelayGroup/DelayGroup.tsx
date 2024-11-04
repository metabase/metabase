import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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

  const timeoutRef = useRef<number>();

  const value = useMemo(
    () => ({
      shouldDelay,
      onOpen() {
        clearTimeout(timeoutRef.current);
        setShouldDelay(false);
      },
      onClose() {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(
          () => setShouldDelay(true),
          timeout,
        );
      },
    }),
    [timeout, shouldDelay],
  );

  useEffect(function () {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useDelayGroup(): DelayGroupContext {
  return useContext(context);
}
