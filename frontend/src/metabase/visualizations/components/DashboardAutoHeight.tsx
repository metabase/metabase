import { createContext, useCallback, useRef } from "react";
import type { ReactNode } from "react";

// A visualization reports its intrinsic content height and allocated viewport
// height. The dashboard adds the card's title, padding, and borders.
export const DashboardAutoHeightContext = createContext<
  ((contentHeight: number | null, viewportHeight?: number) => void) | undefined
>(undefined);

export function DashboardAutoHeight({
  id,
  onHeightChange,
  children,
}: {
  id: number;
  onHeightChange: (id: number, height: number | null) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reportHeight = useCallback(
    (contentHeight: number | null, viewportHeight = 0) => {
      if (contentHeight === null) {
        onHeightChange(id, null);
      } else if (ref.current && viewportHeight > 0) {
        const chromeHeight = Math.max(
          0,
          ref.current.clientHeight - viewportHeight,
        );
        onHeightChange(id, Math.ceil(contentHeight + chromeHeight));
      }
    },
    [id, onHeightChange],
  );

  return (
    <DashboardAutoHeightContext.Provider value={reportHeight}>
      <div ref={ref} style={{ height: "100%" }}>
        {children}
      </div>
    </DashboardAutoHeightContext.Provider>
  );
}
