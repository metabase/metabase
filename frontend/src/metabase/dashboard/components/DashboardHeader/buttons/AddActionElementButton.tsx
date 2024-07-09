import { t } from "ttag";

import { addActionToDashboard } from "metabase/dashboard/actions";
import {
  DashboardHeaderActionDivider,
  DashboardHeaderButton,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Icon, Tooltip } from "metabase/ui";

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
    <>
      <DashboardHeaderActionDivider />
      <Tooltip key="add-action-button" label={t`Add action button`}>
        <DashboardHeaderButton onClick={onAddAction} aria-label={t`Add action`}>
          <Icon name="click" size={18} />
        </DashboardHeaderButton>
      </Tooltip>
    </>
  );
};
