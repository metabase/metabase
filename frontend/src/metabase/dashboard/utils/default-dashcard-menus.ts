import { canEditQuestion } from "metabase/dashboard/components/DashCard/DashCardMenu/utils";
import { PLUGIN_AI_ENTITY_ANALYSIS } from "metabase/plugins";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  isVisualizerDashboardCard,
  isVisualizerSupportedVisualization,
} from "metabase/visualizer/utils";

import type { DashboardCardMenuObject } from "../context/types/dashcard-menu";

export const DEFAULT_DASHCARD_MENU: DashboardCardMenuObject = {
  "edit-visualization": ({ dashcard }) =>
    isVisualizerSupportedVisualization(dashcard.card.display),
  "edit-link": ({ dashcard, question }) =>
    !isVisualizerSupportedVisualization(dashcard.card.display) &&
    !!question &&
    canEditQuestion(question),
  download: ({ series }) => !!series[0]?.data && !series[0]?.error,
  metabot: ({ question }) =>
    !!question && PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion(question),
  "view-underlying-question": ({
    dashboard: _dashboard,
    dashcard,
    question: _question,
    series,
  }) => {
    const settings = getComputedSettingsForSeries(
      series,
    ) as ComputedVisualizationSettings;
    const title = settings["card.title"] ?? series?.[0].card.name ?? "";

    return !title && isVisualizerDashboardCard(dashcard);
  },
};

// For embedding SDK contexts that need the same config
export const EDITABLE_DASHCARD_MENU = DEFAULT_DASHCARD_MENU;
