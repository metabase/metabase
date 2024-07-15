import { t } from "ttag";

import { toggleSidebar } from "metabase/dashboard/actions";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getSidebar } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Tooltip } from "metabase/ui";

export const AddQuestionButton = () => {
  const dispatch = useDispatch();

  const sidebar = useSelector(getSidebar);

  const addQuestionButtonHint =
    sidebar.name === SIDEBAR_NAME.addQuestion
      ? t`Close sidebar`
      : t`Add questions`;

  return (
    <Tooltip label={addQuestionButtonHint}>
      <DashboardHeaderButton
        icon="add"
        isActive={sidebar.name === SIDEBAR_NAME.addQuestion}
        onClick={() => dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion))}
        aria-label={addQuestionButtonHint}
      />
    </Tooltip>
  );
};
