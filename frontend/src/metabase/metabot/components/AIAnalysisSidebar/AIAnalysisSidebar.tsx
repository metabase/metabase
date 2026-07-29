import { useDisclosure } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useAnalyzeChartMutation } from "metabase/api";
import { CopyButton } from "metabase/common/components/CopyButton";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { useSetting } from "metabase/common/hooks";
import { AIAnalysisContent } from "metabase/metabot/components/AIAnalysisContent/AIAnalysisContent";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { Box } from "metabase/ui";
import {
  getChartImagePngDataUri,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";
import type Question from "metabase-lib/v1/Question";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import { getTimelineEventsForAnalysis } from "./utils";

// This is a hack to ensure visualizations have rendered after data loading, as they can render asynchronously.
const RENDER_DELAY_MS = 100;

export interface AIAnalysisSidebarProps {
  question: Question;
  isLoadingComplete: boolean;
  className?: string;
  onClose?: () => void;
  timelines?: Timeline[];
  visibleTimelineEvents?: TimelineEvent[];
}

export function AIAnalysisSidebar({
  question,
  isLoadingComplete,
  timelines,
  visibleTimelineEvents,
  className,
  onClose,
}: AIAnalysisSidebarProps) {
  const previousQuestion = usePrevious(question);
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);
  const isConfigured = !!useSetting("llm-metabot-configured?");
  const [analyzeChart, { data: analysisData }] = useAnalyzeChartMutation();
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
        <AIProviderConfigurationModal
          opened={isAiProviderConfigurationModalOpen}
          onClose={closeAiProviderConfigurationModal}
        />
      </Box>
    </SidebarContent>
  );
}
