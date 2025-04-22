import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { setSidebar } from "metabase/dashboard/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDispatch } from "metabase/lib/redux";

export const AIDashboardAnalysisButton = () => {
  const dispatch = useDispatch();

  const handleClick = () => {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.analyze,
      }),
    );
  };

  const tooltipLabel = t`Explain this dashboard`;

  return (
    <ToolbarButton
      aria-label={tooltipLabel}
      tooltipLabel={tooltipLabel}
      icon={"metabot"}
      onClick={handleClick}
    />
  );
};
