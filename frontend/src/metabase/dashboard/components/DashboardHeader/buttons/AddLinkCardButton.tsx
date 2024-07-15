import { t } from "ttag";

import { addLinkDashCardToDashboard } from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { DashboardHeaderButton } from "../DashboardHeaderButton";

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
    <DashboardHeaderButton
      tooltipLabel={addLinkLabel}
      icon="link"
      aria-label={addLinkLabel}
      onClick={onAddLinkCard}
    />
  );
};
