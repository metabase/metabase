import { useExpressionSidebarHost } from "metabase/querying/components/expressions/ExpressionSidebar";

import { ViewSidebar } from "../../ViewSidebar";

const SIDEBAR_WIDTH = 360;

export function ExpressionSidebarSlot() {
  const host = useExpressionSidebarHost();
  const isOpen = host?.openSidebar != null;

  return (
    <ViewSidebar
      side="right"
      width={SIDEBAR_WIDTH}
      isOpen={isOpen}
      data-testid="expression-sidebar"
    >
      <div
        ref={host?.setContainer}
        style={{ height: "100%" }}
        // A popover closes on a mousedown outside it. The docs belong to the
        // editor in the popover, so clicks here keep it open.
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      />
    </ViewSidebar>
  );
}
