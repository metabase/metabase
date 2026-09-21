import type { PopoverProps } from "@mantine/core";
import {
  type ReactNode,
  type RefObject,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type PopoverSideFallbackContext = {
  wantsSideFallback: boolean;
  setWantsSideFallback: (wantsSideFallback: boolean) => void;
};

const context = createContext<PopoverSideFallbackContext>({
  wantsSideFallback: false,
  setWantsSideFallback: () => undefined,
});

/**
 * Lets popover content that is too tall for short viewports (e.g. the specific
 * date picker's calendar) ask the hosting Popover to fall back to a side
 * placement when there is no room above or below the target. No-op unless the
 * content is rendered inside a PopoverSideFallbackProvider.
 */
export function useRequestPopoverSideFallback() {
  const { setWantsSideFallback } = useContext(context);
  useEffect(() => {
    setWantsSideFallback(true);
    return () => setWantsSideFallback(false);
  }, [setWantsSideFallback]);
}

export function usePopoverSideFallbackMiddlewares(
  dropdownRef: RefObject<HTMLElement>,
): NonNullable<PopoverProps["middlewares"]> {
  const { wantsSideFallback } = useContext(context);

  useEffect(() => {
    if (wantsSideFallback) {
      dropdownRef.current?.style.removeProperty("max-height");
      dropdownRef.current?.style.removeProperty("max-width");
    }
  }, [wantsSideFallback, dropdownRef]);

  return useMemo(
    () => ({
      shift: true,
      flip: wantsSideFallback
        ? { fallbackPlacements: ["top-start", "right", "left"] }
        : true,
      size: { padding: 5 },
    }),
    [wantsSideFallback],
  );
}

export function PopoverSideFallbackProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [wantsSideFallback, setWantsSideFallback] = useState(false);
  const value = useMemo(
    () => ({ wantsSideFallback, setWantsSideFallback }),
    [wantsSideFallback],
  );

  return <context.Provider value={value}>{children}</context.Provider>;
}
