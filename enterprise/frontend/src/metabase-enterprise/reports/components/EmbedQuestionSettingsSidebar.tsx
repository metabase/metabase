import { useMemo } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Loader, Stack, Text } from "metabase/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import { updateVizSettings } from "../reports.slice";
import {
  getIsLoadingCard,
  getIsLoadingDataset,
  getReportCard,
  getReportRawSeries,
} from "../selectors";

interface EmbedQuestionSettingsSidebarProps {
  questionId: number;
  onClose: () => void;
}

export const EmbedQuestionSettingsSidebar = ({
  questionId,
}: EmbedQuestionSettingsSidebarProps) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const card = useSelector((state) => getReportCard(state, questionId));
  const series = useSelector((state) => getReportRawSeries(state, questionId));
  const isCardLoading = useSelector((state) =>
    getIsLoadingCard(state, questionId),
  );
  const isResultsLoading = useSelector((state) =>
    getIsLoadingDataset(state, questionId),
  );

  const question = useMemo(
    () => (card ? new Question(card, metadata) : null),
    [card, metadata],
  );

  const handleSettingsChange = (settings: VisualizationSettings) => {
    if (card) {
      dispatch(updateVizSettings({ cardId: card.id, settings }));
    }
  };

  if (isCardLoading || isResultsLoading || !series) {
    return (
      <Stack gap="lg" p="lg" style={{ height: "100%" }}>
        <Box
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <Loader size="lg" />
          <Text>{t`Loading question settings...`}</Text>
        </Box>
      </Stack>
    );
  }

  if (!card || !series) {
    return (
      <Stack gap="lg" p="lg" style={{ height: "100%" }}>
        <Box
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
          }}
        >
          <Text color="error">{t`Failed to load question`}</Text>
        </Box>
      </Stack>
    );
  }

  return (
    <Box
      style={{
        height: "100%",
        overflow: "auto",
        backgroundColor: "var(--mb-color-bg-white)",
      }}
    >
      <QuestionChartSettings
        question={question as any}
        series={series}
        onChange={handleSettingsChange}
        computedSettings={card.visualization_settings || {}}
      />
    </Box>
  );
};
