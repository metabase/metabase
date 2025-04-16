import { useEffect } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import {
  getChartImage,
  getChartSelector,
} from "metabase/visualizations/lib/save-chart-image";
import type Question from "metabase-lib/v1/Question";
import type { Timeline } from "metabase-types/api";

import { useAnalyzeChartMutation } from "../../../api/ai-entity-analysis";
import { AIAnalysisContent } from "../AIAnalysisContent";

import styles from "./AIQuestionAnalysisSidebar.module.css";

export interface AIQuestionAnalysisSidebarProps {
  question: Question;
  className?: string;
  onClose?: () => void;
  timelines?: Timeline[];
}

export function AIQuestionAnalysisSidebar({
  question,
  timelines,
  className,
  onClose,
}: AIQuestionAnalysisSidebarProps) {
  const [analyzeChart, { data: analysisData }] = useAnalyzeChartMutation();

  useEffect(() => {
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

    const fetchData = async () => {
      const imageFile = await getChartImage(
        getChartSelector({ cardId: question.id() }),
      );
      if (imageFile) {
        await analyzeChart({
          image: imageFile,
          name: question.card().name,
          description: question.card().description ?? undefined,
          timelineEvents,
        });
      }
    };

    fetchData();
  }, []);

  return (
    <SidebarContent
      className={className}
      title={t`Explain these results`}
      onClose={onClose}
      icon="metabot"
    >
      <div className={styles.contentWrapper}>
        <AIAnalysisContent explanation={analysisData?.summary} />
      </div>
    </SidebarContent>
  );
}
