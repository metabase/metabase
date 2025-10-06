import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

import {
  getChartImagePngDataUri,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";
import type { DashCardId } from "metabase-types/api";

import { useAnalyzeChartMutation } from "../../api/ai-entity-analysis";

// Delay time to ensure visualizations have rendered after data loading
const RENDER_DELAY_MS = 100;

interface UseDashCardAnalysisOptions {
  dashcardId?: DashCardId;
  name?: string | null;
  description?: string | null;
  isLoadingComplete: boolean;
  isEnabled?: boolean;
}

export function useDashCardAnalysis({
  dashcardId,
  name,
  description,
  isLoadingComplete,
  isEnabled = true,
}: UseDashCardAnalysisOptions) {
  const [analyzeChart, { data: analysisData, isLoading }] =
    useAnalyzeChartMutation();
  const pendingAnalysisRef = useRef(true);
  const analysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDashcardId = usePrevious(dashcardId);

  useEffect(() => {
    if (prevDashcardId === dashcardId) {
      return;
    }

    if (prevDashcardId != null && prevDashcardId !== dashcardId) {
      pendingAnalysisRef.current = true;
    }

    if (!isEnabled || !pendingAnalysisRef.current || !isLoadingComplete) {
      return;
    }

    analysisTimeoutRef.current = setTimeout(async () => {
      const imageBase64 = await getChartImagePngDataUri(
        getChartSelector({ dashcardId }),
      );

      if (imageBase64) {
        await analyzeChart({
          imageBase64,
          name: name ?? undefined,
          description: description ?? undefined,
          timelineEvents: [],
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
    dashcardId,
    prevDashcardId,
    isLoadingComplete,
    name,
    description,
    isEnabled,
  ]);

  return {
    analysisData: analysisData?.summary,
    isLoading:
      isLoading ||
      (isEnabled && isLoadingComplete && pendingAnalysisRef.current),
  };
}
