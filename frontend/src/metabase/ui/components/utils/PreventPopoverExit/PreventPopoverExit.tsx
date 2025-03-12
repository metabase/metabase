import {
  Children,
  cloneElement,
  createContext,
  useContext,
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
  const ctx = useContext(context);
  ctx.setAllowPopoverExit(popoverIsExitable);
}

export function PreventPopoverExitProvider({
  children,
}: {
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
