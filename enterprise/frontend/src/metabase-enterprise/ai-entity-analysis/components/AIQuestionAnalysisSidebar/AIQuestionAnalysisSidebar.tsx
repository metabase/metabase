import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import { useSelector } from "metabase/lib/redux";
import type { AIQuestionAnalysisSidebarProps } from "metabase/plugins";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { getIsLoadingComplete } from "metabase/query_builder/selectors";
import { Box } from "metabase/ui";
import {
  getChartImagePngDataUri,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";

import { useAnalyzeChartMutation } from "../../../api/ai-entity-analysis";
import { AIAnalysisContent } from "../AIAnalysisContent/AIAnalysisContent";

import { getTimelineEventsForAnalysis } from "./utils";

// This is a hack to ensure visualizations have rendered after data loading, as they can render asynchronously.
const RENDER_DELAY_MS = 100;

export function AIQuestionAnalysisSidebar({
  question,
  timelines,
  visibleTimelineEvents,
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

    const questionCollectionId = question.card().collection_id;
    const timelineEvents =
      questionCollectionId == null
        ? []
        : getTimelineEventsForAnalysis(
            visibleTimelineEvents ?? [],
            timelines ?? [],
            questionCollectionId,
          );

    analysisTimeoutRef.current = setTimeout(async () => {
      const imageBase64 = await getChartImagePngDataUri(
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
  }, [
    analyzeChart,
    isLoadingComplete,
    question,
    timelines,
    visibleTimelineEvents,
  ]);

  const renderCopyButton = () => {
    if (!analysisData?.summary) {
      return null;
    }

    return (
      <CopyButton
        value={analysisData.summary}
        style={{ color: "var(--mb-color-text-secondary)" }}
        aria-label={t`Copy`}
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
      <Box px="1.5rem" py="0.5rem">
        <AIAnalysisContent explanation={analysisData?.summary} />
      </Box>
    </SidebarContent>
  );
}
