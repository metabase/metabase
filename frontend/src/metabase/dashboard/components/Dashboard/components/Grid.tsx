import { useDashboardContext } from "metabase/dashboard/context";
import type { FlexProps } from "metabase/ui";

import { DashboardGridConnected } from "../../DashboardGrid";

export const Grid = ({
  className,
  h,
  w,
  flex,
}: Pick<FlexProps, "className" | "h" | "w" | "flex">) => {
  const {
    dashboard,
    isEditing,
    isFullscreen,
    shouldRenderAsNightMode,
    handleSetEditing,
    selectedTabId,
    clickBehaviorSidebarDashcard,
    isEditingParameter,
    slowCards,
    navigateToNewCardFromDashboard,
    autoScrollToDashcardId,
    reportAutoScrolledToDashcard,
    downloadsEnabled,
  } = useDashboardContext();

  if (!dashboard) {
    return null;
  }

  return (
    <DashboardGridConnected
      className={className}
      h={h}
      w={w}
      flex={flex}
      clickBehaviorSidebarDashcard={clickBehaviorSidebarDashcard}
      isNightMode={shouldRenderAsNightMode}
      isFullscreen={isFullscreen}
      isEditingParameter={isEditingParameter}
      isEditing={isEditing}
      dashboard={dashboard}
      slowCards={slowCards}
      navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
      selectedTabId={selectedTabId}
      onEditingChange={handleSetEditing}
      downloadsEnabled={downloadsEnabled}
      autoScrollToDashcardId={autoScrollToDashcardId}
      reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
    />
  );
};
