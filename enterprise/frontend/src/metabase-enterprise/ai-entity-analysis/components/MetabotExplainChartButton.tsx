import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";

import { toggleExplainSidebar } from "../state";

export const MetabotExplainChartButton = () => {
  const dispatch = useDispatch();

  const handleClick = () => {
    dispatch(toggleExplainSidebar());
  };

  const tooltipLabel = t`Explain this chart`;

  return (
    <ToolbarButton
      aria-label={tooltipLabel}
      tooltipLabel={tooltipLabel}
      icon={"metabot"}
      onClick={handleClick}
    />
  );
};
