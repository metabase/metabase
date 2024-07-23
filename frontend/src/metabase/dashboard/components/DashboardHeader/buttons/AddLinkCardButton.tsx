import { t } from "ttag";

import { addLinkDashCardToDashboard } from "metabase/dashboard/actions";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Icon, Tooltip } from "metabase/ui";

export const AddLinkCardButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const selectedTabId = useSelector(getSelectedTabId);

  const onAddLinkCard = () => {
    if (dashboard) {
      dispatch(
        addLinkDashCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
        }),
      );
    }
  };

  const addLinkLabel = t`Add link card`;
  return (
    <Tooltip label={addLinkLabel}>
      <DashboardHeaderButton aria-label={addLinkLabel} onClick={onAddLinkCard}>
        <Icon name="link" size={18} />
      </DashboardHeaderButton>
    </Tooltip>
  );
};
