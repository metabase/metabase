import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { CopyButton } from "metabase/components/CopyButton";
import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import type { AIQuestionAnalysisSidebarProps } from "metabase/plugins";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { getIsLoadingComplete } from "metabase/query_builder/selectors";
import {
  getBase64ChartImage,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";

import { useAnalyzeChartMutation } from "../../../api/ai-entity-analysis";
import { AIAnalysisContent } from "../AIAnalysisContent";

import styles from "./AIQuestionAnalysisSidebar.module.css";

// TODO: This is a hack to ensure visualizations have rendered after data loading, as they can render asynchronously.
// We should find a better way to do this.
const RENDER_DELAY_MS = 100;

export function AIQuestionAnalysisSidebar({
  question,
  timelines,
  className,
  onClose,
}: AIQuestionAnalysisSidebarProps) {
  const previousQuestion = usePrevious(question);
  const [analyzeChart, { data: analysisData }] = useAnalyzeChartMutation();
  const isLoadingComplete = useSelector(getIsLoadingComplete);
  const pendingAnalysisRef = useRef(false);
  const analysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const isQueryDirty = previousQuestion
      ? question.isQueryDirtyComparedTo(previousQuestion)
      : true;

    if (isQueryDirty) {
      pendingAnalysisRef.current = true;
    }
  }, [previousQuestion, question]);

  useEffect(() => {
    if (!pendingAnalysisRef.current || !isLoadingComplete) {
      return;
    }

    const timelineEvents =
      timelines
        ?.flatMap((timeline) =>
          timeline.events?.map((event) => ({
            name: event.name,
            description: event.description ?? undefined,
            timestamp: event.timestamp,
          })),
        )
        ?.filter(isNotNull) ?? [];

    analysisTimeoutRef.current = setTimeout(async () => {
      const imageBase64 = await getBase64ChartImage(
        getChartSelector({ cardId: question.id() }),
      );

      if (imageBase64) {
        await analyzeChart({
          imageBase64,
          name: question.card().name,
          description: question.card().description ?? undefined,
          timelineEvents,
        });
      }

      pendingAnalysisRef.current = false;
      analysisTimeoutRef.current = null;
    }, RENDER_DELAY_MS);

    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
    };
  }, [analyzeChart, isLoadingComplete, question, timelines]);

  const renderCopyButton = () => {
    if (!analysisData?.summary) {
      return null;
    }

    return (
      <CopyButton
        value={analysisData.summary}
        className={styles.copyButton}
        aria-label={t`Copy summary`}
      />
    );
  };

  return (
    <SidebarContent
      className={className}
      title={t`Explain these results`}
      onClose={onClose}
      icon="metabot"
      headerActions={renderCopyButton()}
    >
      <div className={styles.contentWrapper}>
        <AIAnalysisContent explanation={analysisData?.summary} />
      </div>
    </SidebarContent>
  );
}
