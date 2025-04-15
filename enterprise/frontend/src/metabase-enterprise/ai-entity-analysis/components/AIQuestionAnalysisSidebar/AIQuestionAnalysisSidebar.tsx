import cx from "classnames";
import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { getIsAnySidebarOpen } from "metabase/query_builder/selectors";
import { getChartImage } from "metabase/visualizations/lib/save-chart-image";

import { useAnalyzeChartMutation } from "../../../api/ai-entity-analysis";
import { closeExplainSidebar } from "../../state";
import type { AiAnalysisStoreState } from "../../state/selectors";
import { getIsExplainSidebarVisible } from "../../state/selectors";
import { AIAnalysisContent } from "../AIAnalysisContent";

import styles from "./AIQuestionAnalysisSidebar.module.css";

type AIQuestionAnalysisSidebarProps = {
  className?: string;
};

export function AIQuestionAnalysisSidebar({
  className,
}: AIQuestionAnalysisSidebarProps) {
  const dispatch = useDispatch();
  const isVisible = useSelector((state) =>
    getIsExplainSidebarVisible(state as unknown as AiAnalysisStoreState),
  );
  const isAnySidebarOpen = useSelector(getIsAnySidebarOpen);
  const [analyzeChart, { isLoading, data: analysisData, error: apiError }] =
    useAnalyzeChartMutation();

  const handleClose = useCallback(() => {
    dispatch(closeExplainSidebar());
  }, [dispatch]);

  useEffect(() => {
    if (isVisible && isAnySidebarOpen) {
      dispatch(closeExplainSidebar());
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
          name: "Chart Analysis",
        });
      }
    };

    fetchData();
  }, [isVisible, analysisData, analyzeChart]);

  if (!isVisible) {
    return null;
  }

  const error = apiError ? t`Failed to analyze chart` : null;

  return (
    <SidebarContent
      className={cx(styles.sidebarContent, className)}
      title={t`Explain these results`}
      onClose={handleClose}
    >
      <div className={styles.contentWrapper}>
        <AIAnalysisContent
          explanation={analysisData?.summary || null}
          isLoading={isLoading}
          error={error}
        />
      </div>
    </SidebarContent>
  );
}
