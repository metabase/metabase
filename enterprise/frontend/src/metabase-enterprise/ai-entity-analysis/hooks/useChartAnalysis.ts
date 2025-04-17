import { useEffect, useRef } from "react";

import { isNotNull } from "metabase/lib/types";
import {
  getBase64ChartImage,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";
import type Question from "metabase-lib/v1/Question";
import type { Timeline } from "metabase-types/api";

import { useAnalyzeChartMutation } from "../../api/ai-entity-analysis";

// Delay time to ensure visualizations have rendered after data loading
const RENDER_DELAY_MS = 100;

interface UseChartAnalysisOptions {
  question: Question;
  timelines?: Timeline[];
  isLoadingComplete: boolean;
}

export function useChartAnalysis({
  question,
  timelines,
  isLoadingComplete,
}: UseChartAnalysisOptions) {
  const [analyzeChart, { data: analysisData, isLoading }] =
    useAnalyzeChartMutation();
  const pendingAnalysisRef = useRef(true);
  const analysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return {
    analysisData: analysisData?.summary,
    isLoading: isLoading || (isLoadingComplete && pendingAnalysisRef.current),
    reloadAnalysis: () => {
      pendingAnalysisRef.current = true;
    },
  };
}
