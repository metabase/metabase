import cx from "classnames";
import { useRef } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { VisualizationRunningState } from "metabase/visualizations/components/Visualization/VisualizationRunningState";
import { getChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton";
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
// Where the cohort table's "Cohort" header text starts: the grid's padding
// plus the header cell's, in CohortTable.module.css. The title lines up with it.
const COHORT_LABEL_INSET = "1rem";

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
  /** Shown in place of the chart, once there's a result. */
  placeholder?: string;
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
  placeholder,
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
  // A rerun empties `dataset`, so the last chart shown stays up under the
  // running overlay, as in the query builder. Before any chart, a skeleton.
  const lastShownSeries = useRef<RawSeries | null>(null);
  if (isShowingVisualization) {
    lastShownSeries.current = rawSeries;
  }
  const staleSeries = isLoading ? lastShownSeries.current : null;
  const shownSeries = isShowingVisualization ? rawSeries : staleSeries;
  const displayLabel = isDisplayOpen
    ? t`Hide display options`
    : t`Show display options`;
  // Stays clickable while the panel is open, so a rerun can't strand it.
  const canToggleDisplay = isShowingVisualization || isDisplayOpen;
  return (
    <Paper withBorder radius="md" p="lg" miw={0} mih={MIN_HEIGHT_PX} flex={1}>
      <Stack h="100%">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Title
            order={4}
            pl={display === "cohort" ? COHORT_LABEL_INSET : undefined}
          >
            {title}
          </Title>
          <Tooltip label={displayLabel}>
            <ActionIcon
              // Metabase's theme makes the default variant's border
              // transparent; this restores Mantine's bordered look.
              variant="default"
              size="lg"
              bd="1px solid var(--mb-color-border-neutral)"
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
          {!isIncomplete && isLoading && staleSeries === null && (
            <Flex direction="column" flex={1} mih={0}>
              {getChartSkeletonImage(display)}
            </Flex>
          )}
          {!isIncomplete && !isLoading && !error && rawSeries === null && (
            <Text c="text-secondary">{t`Results will appear here.`}</Text>
          )}
          {shownSeries !== null && placeholder !== undefined && (
            <Stack align="center" justify="center" flex={1} ta="center">
              <Text c="text-secondary" maw="32rem">
                {placeholder}
              </Text>
            </Stack>
          )}
          {shownSeries !== null && placeholder === undefined && (
            <Box flex={1} mih={0} pos="relative">
              <Visualization
                rawSeries={shownSeries}
                isQueryBuilder={false}
                mode={clickActionsMode}
                onChangeCardAndRun={noop}
              />
              {staleSeries !== null && (
                <VisualizationRunningState className={cx(CS.spread, CS.z2)} />
              )}
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
