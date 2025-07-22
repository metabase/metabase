import { useMemo } from "react";
import { t } from "ttag";

import { useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Loader, Stack, Text } from "metabase/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

interface EmbedQuestionSettingsSidebarProps {
  questionId: number;
  onClose: () => void;
}

export const EmbedQuestionSettingsSidebar = ({
  questionId,
}: EmbedQuestionSettingsSidebarProps) => {
  const metadata = useSelector(getMetadata);
  const { data: card, isLoading: isCardLoading } = useGetCardQuery({
    id: questionId,
  });
  const { data: queryResults, isLoading: isResultsLoading } =
    useGetCardQueryQuery({ cardId: questionId });

  const question = useMemo(
    () => new Question(card, metadata),
    [card, metadata],
  );
  const series = useMemo(() => {
    if (!card || !queryResults?.data) {
      return null;
    }
    return [
      {
        card,
        data: queryResults.data,
      },
    ];
  }, [card, queryResults]);

  const handleSettingsChange = (settings: VisualizationSettings) => {
    // For now, this doesn't update the embedded question
    // This is just for viewing settings
    // eslint-disable-next-line no-console
    console.log("Settings changed:", settings);
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

  if (!card || !queryResults?.data) {
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
