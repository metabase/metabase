import { t } from "ttag";
import { noop } from "underscore";

import { Alert, Box, Loader, Paper, Stack, Text, Title } from "metabase/ui";
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

  return (
    <Paper withBorder p="lg" style={{ flex: 1, minWidth: 0 }} mih={420}>
      <Title order={4}>{title}</Title>
      <Stack gap="sm" mt="md">
        {warnings.map((warning) => (
          <Alert key={warning} color="warning">
            {warning}
          </Alert>
        ))}
        {error && <Alert color="error">{error}</Alert>}
        {isLoading && (
          <Box ta="center" py="xl">
            <Loader />
          </Box>
        )}
        {!isLoading && !error && rawSeries === null && (
          <Text c="text-secondary">{t`Results will appear here.`}</Text>
        )}
        {!isLoading && !error && rawSeries !== null && (
          <Box h={420}>
            <Visualization
              rawSeries={rawSeries}
              isQueryBuilder={false}
              onChangeCardAndRun={noop}
            />
          </Box>
        )}
      </Stack>
    </Paper>
  );
};
