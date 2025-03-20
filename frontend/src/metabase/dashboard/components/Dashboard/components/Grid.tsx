import { useDashboardContext } from "metabase/dashboard/context";

import { DashboardGridConnected } from "../../DashboardGrid";

export const Grid = () => {
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
