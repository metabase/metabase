import { useEffect, useRef } from "react";

import {
  getBase64ChartImage,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";
import type { Card, DashCardId } from "metabase-types/api";

import { useAnalyzeChartMutation } from "../../api/ai-entity-analysis";

// Delay time to ensure visualizations have rendered after data loading
const RENDER_DELAY_MS = 100;

interface UseDashCardAnalysisOptions {
  dashcardId: DashCardId;
  card: Card;
  isLoadingComplete: boolean;
  isEnabled?: boolean;
}

export function useDashCardAnalysis({
  dashcardId,
  card,
  isLoadingComplete,
  isEnabled = true,
}: UseDashCardAnalysisOptions) {
  const [analyzeChart, { data: analysisData, isLoading }] =
    useAnalyzeChartMutation();
  const pendingAnalysisRef = useRef(true);
  const analysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isEnabled || !pendingAnalysisRef.current || !isLoadingComplete) {
      return;
    }

    analysisTimeoutRef.current = setTimeout(async () => {
      const imageBase64 = await getBase64ChartImage(
        getChartSelector({ dashcardId }),
      );

      if (imageBase64) {
        await analyzeChart({
          imageBase64,
          name: card.name,
          description: card.description ?? undefined,
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
  }, [analyzeChart, dashcardId, isLoadingComplete, card, isEnabled]);

  return {
    analysisData: analysisData?.summary,
    isLoading:
      isLoading ||
      (isEnabled && isLoadingComplete && pendingAnalysisRef.current),
    reloadAnalysis: () => {
      pendingAnalysisRef.current = true;
    },
  };
}
