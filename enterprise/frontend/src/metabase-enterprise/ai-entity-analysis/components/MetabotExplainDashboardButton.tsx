import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";

import { toggleExplainSidebar } from "../state";

export const MetabotExplainDashboardButton = () => {
  const dispatch = useDispatch();

  const handleClick = () => {
    dispatch(toggleExplainSidebar());
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
