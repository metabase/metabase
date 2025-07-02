import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { addActionToDashboard } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { useDispatch } from "metabase/lib/redux";

export const AddActionElementButton = () => {
  const { dashboard, selectedTabId } = useDashboardContext();
  const dispatch = useDispatch();

  const onAddAction = () => {
    if (dashboard) {
      dispatch(
        addActionToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
          displayType: "button",
          action: {},
        }),
      );
    }
  };

  return (
    <ToolbarButton
      aria-label={t`Add action`}
      onClick={onAddAction}
      icon="click"
      tooltipLabel={t`Add action button`}
    />
  );
};
