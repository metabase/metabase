import { t } from "ttag";
import { noop } from "underscore";

import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
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

type AnalysisSeriesInput = {
  title: string;
  display: CardDisplayType;
  vizSettings: VisualizationSettings;
  dataset: Dataset | undefined;
  datasetQuery: DatasetQuery | undefined;
};

/** The chart's series, once there's a result. Also feeds the display panel. */
export const getAnalysisRawSeries = ({
  title,
  display,
  vizSettings,
  dataset,
  datasetQuery,
}: AnalysisSeriesInput): RawSeries | null =>
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
  isDisplayOpen: boolean;
  onToggleDisplay: () => void;
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
  isDisplayOpen,
  onToggleDisplay,
}: AnalysisResultProps) => {
  const rawSeries = getAnalysisRawSeries({
    title,
    display,
    vizSettings,
    dataset,
    datasetQuery,
  });
  // Errors and loading come first: settings can't be finished without a table.
  const isIncomplete = missing.length > 0 && !error && !isLoading;
  const isShowingVisualization =
    !isIncomplete && !isLoading && !error && rawSeries !== null;
  const displayLabel = isDisplayOpen
    ? t`Hide display options`
    : t`Show display options`;
  // Stays clickable while the panel is open, so a rerun can't strand it.
  const canToggleDisplay = isShowingVisualization || isDisplayOpen;
  return (
    <Paper withBorder radius="md" p="lg" miw={0} mih={MIN_HEIGHT_PX} flex={1}>
      <Stack h="100%">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Title order={4}>{title}</Title>
          <Tooltip label={displayLabel}>
            <ActionIcon
              // Metabase's theme makes the default variant's border
              // transparent; this restores Mantine's bordered look.
              variant="default"
              size="lg"
              bd="1px solid var(--mb-color-border)"
              aria-label={displayLabel}
              aria-pressed={isDisplayOpen}
              disabled={!canToggleDisplay}
              onClick={onToggleDisplay}
            >
              <Icon name="palette" />
            </ActionIcon>
          </Tooltip>
        </Group>
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
