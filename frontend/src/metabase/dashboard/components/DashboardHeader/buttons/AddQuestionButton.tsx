import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { toggleSidebar } from "metabase/dashboard/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getSidebar } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

import { addDashboardQuestion } from "../../QuestionPicker/actions";

export const AddQuestionButton = () => {
  const dispatch = useDispatch();
  const sidebar = useSelector(getSidebar);

  const sidebarOpen = sidebar.name === SIDEBAR_NAME.addQuestion;

  const addQuestionButtonHint = sidebarOpen
    ? t`Close sidebar`
    : t`Add questions`;

  useRegisterShortcut(
    [
      {
        id: "dashboard-add-notebook-question",
        perform: () => dispatch(addDashboardQuestion("notebook")),
      },
      {
        id: "dashboard-add-native-question",
        perform: () => dispatch(addDashboardQuestion("native")),
      },
      {
        id: "dashboard-toggle-add-question-sidepanel",
        perform: () => dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion)),
      },
    ],
    [sidebarOpen],
  );

  return (
    <ToolbarButton
      tooltipLabel={addQuestionButtonHint}
      icon="add"
      isActive={sidebar.name === SIDEBAR_NAME.addQuestion}
      onClick={() => dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion))}
      aria-label={addQuestionButtonHint}
    />
  );
};
