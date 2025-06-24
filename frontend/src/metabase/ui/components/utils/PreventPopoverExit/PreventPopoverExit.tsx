import {
  Children,
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type PreventPopoverExitContext = {
  setAllowPopoverExit: (allowExit: boolean) => void;
};

const context = createContext<PreventPopoverExitContext>({
  setAllowPopoverExit: () => undefined,
});

export function usePreventPopoverExit({
  popoverIsExitable = false,
}: {
  popoverIsExitable?: boolean;
}) {
  const { setAllowPopoverExit } = useContext(context);
  useEffect(() => {
    setAllowPopoverExit(popoverIsExitable);
    return () => setAllowPopoverExit(true);
  }, [popoverIsExitable, setAllowPopoverExit]);
}

export function PreventPopoverExitProvider({
  children,
}: {
  // children needs to be a single Popover component.
  children: JSX.Element;
}) {
  const [allowPopoverExit, setAllowPopoverExit] = useState(true);
  const value = useMemo(() => ({ setAllowPopoverExit }), [setAllowPopoverExit]);

  return (
    <context.Provider value={value}>
      {cloneElement(Children.only(children), {
        closeOnEscape: allowPopoverExit,
        closeOnClickOutside: allowPopoverExit,
      })}
    </context.Provider>
  );
}
