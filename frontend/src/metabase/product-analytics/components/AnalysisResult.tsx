import { useState } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import { Warnings } from "metabase/common/components/Warnings";
import {
  Alert,
  Box,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  CardDisplayType,
  Dataset,
  DatasetQuery,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

const SYNTHETIC_CARD_ID = -1;

type AnalysisResultProps = {
  title: string;
  display: CardDisplayType;
  vizSettings: VisualizationSettings;
  dataset: Dataset | undefined;
  datasetQuery: DatasetQuery | undefined;
  isLoading: boolean;
  error: string | undefined;
  warnings: string[];
};

export const AnalysisResult = ({
  title,
  display,
  vizSettings,
  dataset,
  datasetQuery,
  isLoading,
  error,
  warnings,
}: AnalysisResultProps) => {
  const [vizWarnings, setVizWarnings] = useState<string[]>([]);
  const rawSeries: RawSeries | null =
    dataset?.data !== undefined && datasetQuery !== undefined
      ? [
          {
            card: {
              id: SYNTHETIC_CARD_ID,
              name: title,
              display,
              visualization_settings: vizSettings,
              dataset_query: datasetQuery,
            },
            data: dataset.data,
          },
        ]
      : null;
  const isShowingVisualization = !isLoading && !error && rawSeries !== null;
  const allWarnings = isShowingVisualization
    ? [...warnings, ...vizWarnings]
    : warnings;

  return (
    <Paper withBorder p="lg" style={{ flex: 1, minWidth: 0 }} mih={420}>
      <Group justify="space-between" wrap="nowrap">
        <Title order={4}>{title}</Title>
        <Warnings warnings={allWarnings} size={18} />
      </Group>
      <Stack gap="sm" mt="md">
        {error && <Alert color="error">{error}</Alert>}
        {isLoading && (
          <Box ta="center" py="xl">
            <Loader />
          </Box>
        )}
        {!isLoading && !error && rawSeries === null && (
          <Text c="text-secondary">{t`Results will appear here.`}</Text>
        )}
        {isShowingVisualization && (
          <Box h={420}>
            <Visualization
              rawSeries={rawSeries}
              isQueryBuilder={false}
              onUpdateWarnings={setVizWarnings}
              onChangeCardAndRun={noop}
            />
          </Box>
        )}
      </Stack>
    </Paper>
  );
};
