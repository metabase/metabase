import { createContext, useContext, useEffect, useState } from "react";

const context = createContext({
  setPreventClose: (_options: PreventCloseOptions | null): void => undefined,
});

type PreventCloseOptions = {
  onClickOutside?: boolean;
  onEscape?: boolean;
};

export function PreventCloseProvider({
  onPreventCloseChange,
  canPreventCloseHandlers,
  children,
}: {
  onPreventCloseChange: (state: PreventCloseOptions | null) => void;
  canPreventCloseHandlers: boolean;
  children: React.ReactNode;
}) {
  if (!canPreventCloseHandlers) {
    return children;
  }
  return (
    <context.Provider value={{ setPreventClose: onPreventCloseChange }}>
      {children}
    </context.Provider>
  );
}

export function usePreventCloseState() {
  const [preventClose, setPreventClose] = useState<PreventCloseOptions | null>(
    null,
  );
  return {
    onPreventCloseChange: setPreventClose,
    closeOnEscape: !preventClose?.onEscape,
    closeOnClickOutside: !preventClose?.onClickOutside,
  };
}

/**
 * Call this hook in a component that is nested inside a Popover component
 * and it will prevent the parent Popover from closing when the
 * relevant events occur.
 */
export function usePreventClosePopover({
  onClickOutside,
  onEscape,
}: {
  /**
   * Set to true to prevent the parent Popover from closing when
   * the user clicks outside the Popover.
   */
  onClickOutside?: boolean;

  /**
   * Set to true to prevent the parent Popover from closing when
   * the user presses the Escape key.
   */
  onEscape?: boolean;
}) {
  const ctx = useContext(context);
  useEffect(() => {
    ctx?.setPreventClose({
      onClickOutside,
      onEscape,
    });
    return () => ctx?.setPreventClose(null);
  }, [ctx, onEscape, onClickOutside]);
}
