import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

import { useDashboardContext } from "metabase/dashboard/context";

export const AddQuestionButton = () => {
  const { sidebar, toggleSidebar, addDashboardQuestion } = useDashboardContext();

  const sidebarOpen = sidebar.name === SIDEBAR_NAME.addQuestion;

  const addQuestionButtonHint = sidebarOpen
    ? t`Close sidebar`
    : t`Add questions`;

  useRegisterShortcut(
    [
      {
        id: "dashboard-add-notebook-question",
        perform: () => (addDashboardQuestion("notebook")),
      },
      {
        id: "dashboard-add-native-question",
        perform: () => (addDashboardQuestion("native")),
      },
    ],
    [sidebarOpen],
  );

  return (
    <ToolbarButton
      tooltipLabel={addQuestionButtonHint}
      icon="add"
      isActive={sidebar.name === SIDEBAR_NAME.addQuestion}
      onClick={() => toggleSidebar(SIDEBAR_NAME.addQuestion)}
      aria-label={addQuestionButtonHint}
    />
  );
};
