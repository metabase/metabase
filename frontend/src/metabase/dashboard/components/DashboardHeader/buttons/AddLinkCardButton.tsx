import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { addLinkDashCardToDashboard } from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

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
    <ToolbarButton
      tooltipLabel={addLinkLabel}
      icon="link"
      aria-label={addLinkLabel}
      onClick={onAddLinkCard}
    />
  );
};
