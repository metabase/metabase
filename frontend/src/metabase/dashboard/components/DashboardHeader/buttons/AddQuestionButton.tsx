import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

import { getNewQuestionUrl } from "../../QuestionPicker/actions";

export const AddQuestionButton = () => {
  const { toggleSidebar, sidebar, dashboard, onChangeLocation } =
    useDashboardContext();

  const sidebarOpen = sidebar.name === SIDEBAR_NAME.addQuestion;

  const addQuestionButtonHint = sidebarOpen
    ? t`Close sidebar`
    : t`Add questions`;

  useRegisterShortcut(
    [
      {
        id: "dashboard-add-notebook-question",
        perform: () =>
          onChangeLocation(getNewQuestionUrl({ dashboard, type: "notebook" })),
      },
      {
        id: "dashboard-add-native-question",
        perform: () =>
          onChangeLocation(getNewQuestionUrl({ dashboard, type: "native" })),
      },
      {
        id: "dashboard-toggle-add-question-sidepanel",
        perform: () => toggleSidebar(SIDEBAR_NAME.addQuestion),
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
