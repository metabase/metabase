import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { getIsAnySidebarOpen } from "metabase/query_builder/selectors";
import { getChartImage } from "metabase/visualizations/lib/save-chart-image";
import type Question from "metabase-lib/v1/Question";

import { useAnalyzeChartMutation } from "../../../api/ai-entity-analysis";
import { closeAIQuestionAnalysisSidebar } from "../../state";
import type { AiAnalysisStoreState } from "../../state/selectors";
import { getIsAIQuestionAnalysisSidebarVisible } from "../../state/selectors";
import { AIAnalysisContent } from "../AIAnalysisContent";

import styles from "./AIQuestionAnalysisSidebar.module.css";

export interface AIQuestionAnalysisSidebarProps {
  question: Question;
}

export function AIQuestionAnalysisSidebar({
  question,
}: AIQuestionAnalysisSidebarProps) {
  const dispatch = useDispatch();
  const isVisible = useSelector((state) =>
    getIsAIQuestionAnalysisSidebarVisible(
      state as unknown as AiAnalysisStoreState,
    ),
  );
  const isAnySidebarOpen = useSelector(getIsAnySidebarOpen);
  const [analyzeChart, { data: analysisData }] = useAnalyzeChartMutation();

  const handleClose = useCallback(() => {
    dispatch(closeAIQuestionAnalysisSidebar());
  }, [dispatch]);

  useEffect(() => {
    if (isVisible && isAnySidebarOpen) {
      dispatch(closeAIQuestionAnalysisSidebar());
    }
  }, [isVisible, isAnySidebarOpen, dispatch]);

  useEffect(() => {
    const fetchData = async () => {
      if (!isVisible || analysisData) {
        return;
      }

      const imageFile = await getChartImage("#chart-image");
      if (imageFile) {
        await analyzeChart({
          image: imageFile,
          name: question.card().name,
        });
      }
    };

    fetchData();
  }, [isVisible, analysisData, analyzeChart, question]);

  if (!isVisible) {
    return null;
  }

  return (
    <SidebarContent
      title={t`Explain these results`}
      onClose={handleClose}
      icon="metabot"
    >
      <div className={styles.contentWrapper}>
        <AIAnalysisContent explanation={analysisData?.summary} />
      </div>
    </SidebarContent>
  );
}
