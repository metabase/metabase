import { t } from "ttag";
import { noop } from "underscore";

import {
  Alert,
  Box,
  Button,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { ClickActionsMode } from "metabase/visualizations/types";
import type {
  CardDisplayType,
  Dataset,
  DatasetQuery,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

import type { MissingSetting } from "../analyses/types";

const SYNTHETIC_CARD_ID = -1;
const MIN_HEIGHT_PX = 400;

type AnalysisResultProps = {
  title: string;
  display: CardDisplayType;
  vizSettings: VisualizationSettings;
  dataset: Dataset | undefined;
  datasetQuery: DatasetQuery | undefined;
  isLoading: boolean;
  error: string | undefined;
  /** Settings still to fill in. When non-empty, this replaces the result. */
  missing: MissingSetting[];
  setupLabel: string;
  /** Omit when the setup panel is already open. */
  onOpenSetup?: () => void;
  clickActionsMode: ClickActionsMode;
};

export const AnalysisResult = ({
  title,
  display,
  vizSettings,
  dataset,
  datasetQuery,
  isLoading,
  error,
  missing,
  setupLabel,
  onOpenSetup,
  clickActionsMode,
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
  // Errors and loading come first: settings can't be finished without a table.
  const isIncomplete = missing.length > 0 && !error && !isLoading;
  const isShowingVisualization =
    !isIncomplete && !isLoading && !error && rawSeries !== null;
  return (
    <Paper withBorder radius="md" p="lg" miw={0} mih={MIN_HEIGHT_PX} flex={1}>
      <Stack h="100%">
        <Title order={4}>{title}</Title>
        <Stack gap="sm" flex={1} mih={0}>
          {isIncomplete && (
            <IncompleteSettings
              missing={missing}
              setupLabel={setupLabel}
              onOpenSetup={onOpenSetup}
            />
          )}
          {!isIncomplete && error && <Alert color="error">{error}</Alert>}
          {!isIncomplete && isLoading && (
            <Box ta="center" py="xl">
              <Loader />
            </Box>
          )}
          {!isIncomplete && !isLoading && !error && rawSeries === null && (
            <Text c="text-secondary">{t`Results will appear here.`}</Text>
          )}
          {isShowingVisualization && (
            <Box flex={1} mih={0}>
              <Visualization
                rawSeries={rawSeries}
                isQueryBuilder={false}
                mode={clickActionsMode}
                onChangeCardAndRun={noop}
              />
            </Box>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};

type IncompleteSettingsProps = {
  missing: MissingSetting[];
  setupLabel: string;
  onOpenSetup?: () => void;
};

const IncompleteSettings = ({
  missing,
  setupLabel,
  onOpenSetup,
}: IncompleteSettingsProps) => (
  <Stack align="center" justify="center" gap="sm" flex={1} ta="center">
    <Title order={4} c="text-secondary">
      {t`Finish setting up this analysis`}
    </Title>
    {missing.map(({ key, message }) => (
      <Text key={key} c="text-secondary">
        {message}
      </Text>
    ))}
    {onOpenSetup && (
      <Button variant="filled" onClick={onOpenSetup}>
        {setupLabel}
      </Button>
    )}
  </Stack>
);
