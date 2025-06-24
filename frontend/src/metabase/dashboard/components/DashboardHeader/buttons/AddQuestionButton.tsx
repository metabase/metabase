import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context/context";
import * as Urls from "metabase/lib/urls";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

export const AddQuestionButton = () => {
  const { toggleSidebar, sidebar, dashboard, onChangeLocation } =
    useDashboardContext();

  const sidebarOpen = sidebar.name === SIDEBAR_NAME.addQuestion;

  const addNotebookQuestion = () => {
    if (dashboard) {
      onChangeLocation(
        Urls.newQuestion({
          mode: "notebook",
          creationType: "custom_question",
          collectionId: dashboard.collection_id || undefined,
          cardType: "question",
          dashboardId: dashboard.id,
        }),
      );
    }
  };

  const addNativeQuestion = () => {
    if (dashboard) {
      onChangeLocation(
        Urls.newQuestion({
          mode: "query",
          type: "native",
          creationType: "native_question",
          collectionId: dashboard.collection_id || undefined,
          cardType: "question",
          dashboardId: dashboard.id,
        }),
      );
    }
  };

  const addQuestionButtonHint = sidebarOpen
    ? t`Close sidebar`
    : t`Add questions`;

  useRegisterShortcut(
    [
      {
        id: "dashboard-add-notebook-question",
        perform: addNotebookQuestion,
      },
      {
        id: "dashboard-add-native-question",
        perform: addNativeQuestion,
      },
      {
        id: "dashboard-toggle-add-question-sidepanel",
        perform: () => toggleSidebar(SIDEBAR_NAME.addQuestion),
      },
    ],
    [sidebarOpen, addNotebookQuestion, addNativeQuestion],
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
