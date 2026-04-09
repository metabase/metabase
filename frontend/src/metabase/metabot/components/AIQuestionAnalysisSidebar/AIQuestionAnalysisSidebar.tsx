import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useAnalyzeChartMutation } from "metabase/api";
import { CopyButton } from "metabase/common/components/CopyButton";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { useSetting } from "metabase/common/hooks";
import { useAiProviderConfigurationModal } from "metabase/metabot/hooks";
import { getIsLoadingComplete } from "metabase/query_builder/selectors";
import { useSelector } from "metabase/redux";
import { Box } from "metabase/ui";
import {
  getChartImagePngDataUri,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";
import type Question from "metabase-lib/v1/Question";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import { AIAnalysisContent } from "../AIAnalysisContent/AIAnalysisContent";
import { AIProviderConfigurationNotice } from "../AIProviderConfigurationNotice";

import { getTimelineEventsForAnalysis } from "./utils";

// This is a hack to ensure visualizations have rendered after data loading, as they can render asynchronously.
const RENDER_DELAY_MS = 100;

export interface AIQuestionAnalysisSidebarProps {
  question: Question;
  className?: string;
  onClose?: () => void;
  timelines?: Timeline[];
  visibleTimelineEvents?: TimelineEvent[];
}

export function AIQuestionAnalysisSidebar({
  question,
  timelines,
  visibleTimelineEvents,
  className,
  onClose,
}: AIQuestionAnalysisSidebarProps) {
  const previousQuestion = usePrevious(question);
  const { aiProviderConfigurationModal, openAiProviderConfigurationModal } =
    useAiProviderConfigurationModal();
  const isConfigured = !!useSetting("llm-metabot-configured?");
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
    if (!isConfigured || !pendingAnalysisRef.current || !isLoadingComplete) {
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
    isConfigured,
    isLoadingComplete,
    question,
    timelines,
    visibleTimelineEvents,
  ]);

  const renderCopyButton = () => {
    if (!isConfigured || !analysisData?.summary) {
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
        {isConfigured ? (
          <AIAnalysisContent explanation={analysisData?.summary} />
        ) : (
          <AIProviderConfigurationNotice
            featureName={t`chart analysis`}
            onConfigureAi={openAiProviderConfigurationModal}
          />
        )}
        {aiProviderConfigurationModal}
      </Box>
    </SidebarContent>
  );
}
