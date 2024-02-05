import React from "react";

type DelayGroupContext = {
  shouldDelay: boolean;
  onOpen: () => void;
  onClose: () => void;
};

const context = React.createContext<DelayGroupContext>({
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
  const [shouldDelay, setShouldDelay] = React.useState(true);

  const t = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const value = React.useMemo(
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
    [timeout, shouldDelay, setShouldDelay],
  );

  React.useEffect(function () {
    return () => clearTimeout(t.current);
  }, []);

  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useDelayGroup(): DelayGroupContext {
  return React.useContext(context);
}
