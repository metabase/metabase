import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import {
  PLUGIN_AI_ENTITY_ANALYSIS,
  PLUGIN_DASHCARD_MENU,
} from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type Question from "metabase-lib/v1/Question";
import type { DashCardId } from "metabase-types/api";

import { showDashCardAnalysisSidebar } from "./actions";
import { AIDashboardAnalysisSidebar } from "./components/AIDashboardAnalysisSidebar/AIDashboardAnalysisSidebar";
import { AIQuestionAnalysisButton } from "./components/AIQuestionAnalysisButton";
import { AIQuestionAnalysisSidebar } from "./components/AIQuestionAnalysisSidebar";
import { CHART_ANALYSIS_RENDER_FORMATS, canAnalyzeQuestion } from "./utils";

if (hasPremiumFeature("ai_entity_analysis")) {
  PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisButton = AIQuestionAnalysisButton;
  PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisSidebar =
    AIQuestionAnalysisSidebar;
  PLUGIN_AI_ENTITY_ANALYSIS.AIDashboardAnalysisSidebar =
    AIDashboardAnalysisSidebar;

  PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion = (question: Question) => {
    return canAnalyzeQuestion(question.card().display);
  };

  PLUGIN_AI_ENTITY_ANALYSIS.chartAnalysisRenderFormats =
    CHART_ANALYSIS_RENDER_FORMATS;

  PLUGIN_DASHCARD_MENU.dashcardMenuItemGetters.push(
    (question, dashcardId, dispatch) => {
      if (!PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion(question)) {
        return null;
      }

      return {
        key: "MB_ANALYZE_CHART",
        iconName: "metabot",
        label: t`Analyze chart`,
        onClick: () => {
          if (dashcardId != null) {
            dispatch(showDashCardAnalysisSidebar(dashcardId));
          }
        },
      };
    },
  );
  PLUGIN_DASHCARD_MENU.dashcardMenuItem = function MetabotDashcardMenuItem({
    dashcardId,
  }: {
    dashcardId: DashCardId | null;
  }) {
    const dispatch = useDispatch();
    return (
      <Menu.Item
        leftSection={<Icon name="metabot" />}
        onClick={() => {
          if (dashcardId != null) {
            dispatch(showDashCardAnalysisSidebar(dashcardId));
          }
        }}
        closeMenuOnClick
      >
        {t`Analyze chart`}
      </Menu.Item>
    );
  };
}

export { AIQuestionAnalysisButton };
export { AIQuestionAnalysisSidebar };
