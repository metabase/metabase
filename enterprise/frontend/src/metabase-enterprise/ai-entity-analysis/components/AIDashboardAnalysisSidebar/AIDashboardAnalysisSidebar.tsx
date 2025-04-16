import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { getIsAnySidebarOpen } from "metabase/query_builder/selectors";
import {
  getChartImage,
  getChartSelector,
} from "metabase/visualizations/lib/save-chart-image";
import type Question from "metabase-lib/v1/Question";

import { useAnalyzeChartMutation } from "../../../api/ai-entity-analysis";
import { closeAIDashboardAnalysisSidebar } from "../../state";
import type { AiAnalysisStoreState } from "../../state/selectors";
import { getIsAIDashboardAnalysisSidebarVisible } from "../../state/selectors";
import { AIAnalysisContent } from "../AIAnalysisContent";

import styles from "./AIDashboardAnalysisSidebar.module.css";

export interface AIDashboardAnalysisSidebarProps {
  question: Question;
}

export function AIDashboardAnalysisSidebar({
  question,
}: AIDashboardAnalysisSidebarProps) {
  const dispatch = useDispatch();
  const isVisible = useSelector((state) =>
    getIsAIDashboardAnalysisSidebarVisible(
      state as unknown as AiAnalysisStoreState,
    ),
  );
  const isAnySidebarOpen = useSelector(getIsAnySidebarOpen);
  const [analyzeChart, { data: analysisData }] = useAnalyzeChartMutation();

  const handleClose = useCallback(() => {
    dispatch(closeAIDashboardAnalysisSidebar());
  }, [dispatch]);

  useEffect(() => {
    if (isVisible && isAnySidebarOpen) {
      dispatch(closeAIDashboardAnalysisSidebar());
    }
  }, [isVisible, isAnySidebarOpen, dispatch]);

  useEffect(() => {
    const fetchData = async () => {
      if (!isVisible || analysisData) {
        return;
      }

      const imageFile = await getChartImage(
        getChartSelector({ cardId: question.id() }),
      );
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
