import { useRegisterActions } from "kbar";
import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { toggleSidebar } from "metabase/dashboard/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getSidebar } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

export const AddQuestionButton = () => {
  const dispatch = useDispatch();
  const sidebar = useSelector(getSidebar);

  const addQuestionButtonHint =
    sidebar.name === SIDEBAR_NAME.addQuestion
      ? t`Close sidebar`
      : t`Add questions`;

  useRegisterActions(
    [
      {
        id: "add-question",
        name: "Add Question",
        shortcut: ["a"],
        perform: () => dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion)),
      },
    ],
    [],
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
