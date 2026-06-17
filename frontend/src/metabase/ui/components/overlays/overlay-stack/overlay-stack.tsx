import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { useLatest } from "react-use";

type OverlayStackContextValue = {
  stack: string[];
  push: (id: string) => void;
  remove: (id: string) => void;
};

const OverlayStackContext = createContext<OverlayStackContextValue | null>(
  null,
);

export const OverlayStackProvider = ({ children }: { children: ReactNode }) => {
  const parent = useContext(OverlayStackContext);
  const [stack, setStack] = useState<string[]>([]);

  const push = useCallback((id: string) => {
    setStack((current) => [...current, id]);
  }, []);

  const remove = useCallback((id: string) => {
    setStack((current) => current.filter((stackId) => stackId !== id));
  }, []);

  const value = useMemo(() => ({ stack, push, remove }), [stack, push, remove]);

  if (parent) {
    return <>{children}</>;
  }

  return (
    <OverlayStackContext.Provider value={value}>
      {children}
    </OverlayStackContext.Provider>
  );
};

const useIsTopmost = (opened: boolean) => {
  const context = useContext(OverlayStackContext);
  const id = useId();
  const push = context?.push;
  const remove = context?.remove;

  useEffect(() => {
    if (!opened || !push || !remove) {
      return;
    }
    push(id);
    return () => remove(id);
  }, [opened, id, push, remove]);

  const stack = context?.stack ?? [];
  return opened && (!context || stack.at(-1) === id);
};

const useIsTopmostAtPointerDown = (isTopmost: boolean, opened: boolean) => {
  const isTopmostRef = useLatest(isTopmost);
  const [snapshot, setSnapshot] = useState(isTopmost);

  useEffect(() => {
    if (!opened) {
      return;
    }
    const takeSnapshot = () => setSnapshot(isTopmostRef.current);
    document.addEventListener("pointerdown", takeSnapshot, true);
    return () =>
      document.removeEventListener("pointerdown", takeSnapshot, true);
  }, [opened, isTopmostRef]);

  return snapshot;
};

type GatedCloseProps = {
  opened?: boolean;
  closeOnEscape?: boolean;
  closeOnClickOutside?: boolean;
};

export const useGatedCloseProps = ({
  opened = true,
  closeOnEscape,
  closeOnClickOutside,
}: GatedCloseProps) => {
  const isTopmost = useIsTopmost(opened);
  const isTopmostAtPointerDown = useIsTopmostAtPointerDown(isTopmost, opened);

  return {
    closeOnEscape: isTopmost ? closeOnEscape : false,
    closeOnClickOutside: isTopmostAtPointerDown ? closeOnClickOutside : false,
  };
};

export const OverlayStackItem = () => {
  useIsTopmost(true);
  return null;
};
