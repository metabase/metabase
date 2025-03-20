import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";

export const AddQuestionButton = () => {
  const { sidebar, toggleSidebar } = useDashboardContext();

  const addQuestionButtonHint =
    sidebar.name === SIDEBAR_NAME.addQuestion
      ? t`Close sidebar`
      : t`Add questions`;

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
