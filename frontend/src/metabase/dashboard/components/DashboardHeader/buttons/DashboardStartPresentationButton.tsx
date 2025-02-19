import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { startPresentation } from "metabase/dashboard/actions";
import { getDashboard } from "metabase/dashboard/selectors";

export const DashboardStartPresentationButton = () => {
  const stateDashboard = useSelector(getDashboard);
  const dispatch = useDispatch();

  return (
    <ToolbarButton
      aria-label={t`Start presentation`}
      tooltipLabel={t`Start presentation`}
      icon="play_outlined"
      onClick={() =>
        stateDashboard?.id && dispatch(startPresentation(stateDashboard.id))
      }
    />
  );
};
