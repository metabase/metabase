import { useState } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";
import {
  getChartImage,
  getDashboardImage,
} from "metabase/visualizations/lib/get-dashboard-image";

import {
  useAnalyzeChartMutation,
  useAnalyzeDashboardMutation,
} from "../../api/ai-analysis";
import { setExplanation } from "../state";

interface MetabotExplainButtonProps {
  type: "chart" | "dashboard";
  selector: string;
}

export const MetabotExplainButton = ({
  type,
  selector,
}: MetabotExplainButtonProps) => {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  // TODO: should be in thunks
  const [analyzeChart] = useAnalyzeChartMutation();
  const [analyzeDashboard] = useAnalyzeDashboardMutation();

  const handleClick = async () => {
    try {
      setIsLoading(true);

      const getImage = type === "chart" ? getChartImage : getDashboardImage;
      const imageFile = await getImage(selector);

      if (!imageFile) {
        return;
      }

      const analyze = type === "chart" ? analyzeChart : analyzeDashboard;
      const response = await analyze({
        image: imageFile,
      }).unwrap();

      dispatch(setExplanation({ type, response }));
    } catch (error) {
      // Error handling is managed by the API
    } finally {
      setIsLoading(false);
    }
  };

  const tooltipLabel =
    type === "chart" ? t`Explain this chart` : t`Explain this dashboard`;

  return (
    <ToolbarButton
      aria-label={tooltipLabel}
      tooltipLabel={tooltipLabel}
      icon={"dyno"}
      onClick={handleClick}
      disabled={isLoading}
    />
  );
};
