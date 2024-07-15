import { t } from "ttag";

import { addActionToDashboard } from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { DashboardHeaderButton } from "../DashboardHeaderButton";

export const AddActionElementButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const selectedTabId = useSelector(getSelectedTabId);

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
    <DashboardHeaderButton
      onClick={onAddAction}
      aria-label={t`Add action`}
      tooltipLabel={t`Add action button`}
      icon="click"
    />
  );
};
