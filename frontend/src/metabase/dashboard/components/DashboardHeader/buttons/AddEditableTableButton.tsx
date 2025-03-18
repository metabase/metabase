import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { addEditableTableDashCardToDashboard } from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

export const AddEditableTableButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const selectedTabId = useSelector(getSelectedTabId);

  const title = t`Add editable table`;

  const handleAddTable = () => {
    if (dashboard) {
      dispatch(
        addEditableTableDashCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
        }),
      );
    }
  };

  return (
    <ToolbarButton
      tooltipLabel={title}
      icon="table"
      onClick={() => handleAddTable()}
      aria-label={title}
    />
  );
};
