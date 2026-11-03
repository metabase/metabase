import cx from "classnames";
import { type ReactNode, useRef } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import { ForwardRefLink } from "metabase/common/components/Link";
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
  CardId,
  Dataset,
  DatasetQuery,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

import type { MissingSetting } from "../analyses/types";
import type { AnalysisVisualizationTimelineProps } from "../use-analysis-timelines";

const MIN_HEIGHT_PX = 400;
// Where the cohort table's "Cohort" header text starts: the grid's padding
// plus the header cell's, in CohortTable.module.css. The title lines up with it.
const COHORT_LABEL_INSET = "1rem";

type AnalysisSeriesInput = {
  /**
   * The saved card's id while the chart shows it as saved, so downloads and
   * copies go through the card, as in the query builder. Undefined for an
   * analysis that's new or has unsaved changes: it runs as an ad-hoc query.
   */
  cardId: CardId | undefined;
  title: string;
  display: CardDisplayType;
  vizSettings: VisualizationSettings;
  dataset: Dataset | undefined;
  datasetQuery: DatasetQuery | undefined;
};

/** The chart's series, once there's a result. Also feeds the display panel. */
export const getAnalysisRawSeries = ({
  cardId,
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
            id: cardId,
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
  /** From `getAnalysisRawSeries`; null until there's a result. */
  rawSeries: RawSeries | null;
  isLoading: boolean;
  error: string | undefined;
  /** Settings still to fill in. When non-empty, this replaces the result. */
  missing: MissingSetting[];
  /** Asks for the table's setup first, when it lacks roles every analysis needs. */
  isTableSetUp: boolean;
  /** Data Studio's event settings for the table, for someone who can edit them. */
  tableSettingsUrl: string | undefined;
  /** False while the table's database can't run the prototype's SQL. */
  isDatabaseSupported: boolean;
  setupLabel: string;
  /** Omit when the setup panel is already open. */
  onOpenSetup?: () => void;
  clickActionsMode: ClickActionsMode;
  /** Shown in place of the chart, once there's a result. */
  placeholder?: string;
  isDisplayOpen: boolean;
  onToggleDisplay: () => void;
  timelineProps: AnalysisVisualizationTimelineProps;
};

export const AnalysisResult = ({
  title,
  display,
  rawSeries,
  isLoading,
  error,
  missing,
  isTableSetUp,
  tableSettingsUrl,
  isDatabaseSupported,
  setupLabel,
  onOpenSetup,
  clickActionsMode,
  placeholder,
  isDisplayOpen,
  onToggleDisplay,
  timelineProps,
}: AnalysisResultProps) => {
  // Errors and loading come first: settings can't be finished without a table.
  const isIncomplete =
    (missing.length > 0 || !isTableSetUp) && !error && !isLoading;
  const isUnsupported =
    !isIncomplete && !isDatabaseSupported && !error && !isLoading;
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
          {isIncomplete && !isTableSetUp && (
            <TableSetup tableSettingsUrl={tableSettingsUrl} />
          )}
          {isIncomplete && isTableSetUp && (
            <IncompleteSettings
              missing={missing}
              setupLabel={setupLabel}
              tableSettingsUrl={tableSettingsUrl}
              onOpenSetup={onOpenSetup}
            />
          )}
          {isUnsupported && <UnsupportedDatabase />}
          {!isIncomplete && error && <Alert color="error">{error}</Alert>}
          {!isIncomplete && isLoading && staleSeries === null && (
            <Flex direction="column" flex={1} mih={0}>
              {getChartSkeletonImage(display)}
            </Flex>
          )}
          {!isIncomplete &&
            !isUnsupported &&
            !isLoading &&
            !error &&
            rawSeries === null && (
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
                {...timelineProps}
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
  tableSettingsUrl: string | undefined;
  onOpenSetup?: () => void;
};

/** Settings the table lacks are fixed in Data Studio; the analysis's own, in its setup panel. */
const IncompleteSettings = ({
  missing,
  setupLabel,
  tableSettingsUrl,
  onOpenSetup,
}: IncompleteSettingsProps) => {
  const isMissingTableSetting = missing.some(
    (setting) => setting.isTableSetting,
  );
  return (
    <ResultMessage
      title={
        isMissingTableSetting
          ? t`This table needs additional setup for this analysis`
          : t`Finish setting up this analysis`
      }
    >
      {missing.map(({ key, message }) => (
        <Text key={key} c="text-secondary">
          {message}
        </Text>
      ))}
      {isMissingTableSetting ? (
        <TableSettingsAction
          tableSettingsUrl={tableSettingsUrl}
          linkLabel={t`Edit in Data Studio`}
          askAdminMessage={t`Ask an admin to update this table's event settings in Data Studio.`}
        />
      ) : (
        onOpenSetup && (
          <Button variant="filled" onClick={onOpenSetup}>
            {setupLabel}
          </Button>
        )
      )}
    </ResultMessage>
  );
};

type TableSetupProps = {
  tableSettingsUrl: string | undefined;
};

const TableSetup = ({ tableSettingsUrl }: TableSetupProps) => (
  <ResultMessage title={t`This table isn't set up for product analysis yet`}>
    <TableSettingsAction
      tableSettingsUrl={tableSettingsUrl}
      linkLabel={t`Set up in Data Studio`}
      askAdminMessage={t`Ask an admin to set up this table in Data Studio.`}
    />
  </ResultMessage>
);

type TableSettingsActionProps = {
  tableSettingsUrl: string | undefined;
  linkLabel: string;
  askAdminMessage: string;
};

/** A table's settings are only set in Data Studio, by someone who can edit the table. */
const TableSettingsAction = ({
  tableSettingsUrl,
  linkLabel,
  askAdminMessage,
}: TableSettingsActionProps) =>
  tableSettingsUrl !== undefined ? (
    <Button variant="filled" component={ForwardRefLink} to={tableSettingsUrl}>
      {linkLabel}
    </Button>
  ) : (
    <Text c="text-secondary">{askAdminMessage}</Text>
  );

const UnsupportedDatabase = () => (
  <ResultMessage title={t`This prototype only runs on ClickHouse`}>
    <Text c="text-secondary">
      {t`Its analyses are written in ClickHouse SQL, so they can't run on this table's database yet.`}
    </Text>
  </ResultMessage>
);

type ResultMessageProps = {
  title: string;
  children: ReactNode;
};

const ResultMessage = ({ title, children }: ResultMessageProps) => (
  <Stack align="center" justify="center" flex={1} ta="center">
    <Title order={4} c="text-secondary">
      {title}
    </Title>
    {children}
  </Stack>
);
