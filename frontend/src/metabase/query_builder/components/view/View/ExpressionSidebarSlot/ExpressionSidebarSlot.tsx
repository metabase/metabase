import { useExpressionSidebarHost } from "metabase/querying/components/expressions/ExpressionSidebar";

import { ViewSidebar } from "../../ViewSidebar";

const SIDEBAR_WIDTH = 420;

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
      <div ref={host?.setContainer} style={{ height: "100%" }} />
    </ViewSidebar>
  );
}
