import { useRef, useState } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import {
  Alert,
  Box,
  Button,
  Group,
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

import S from "./AnalysisResult.module.css";
import { ResizeHandle } from "./ResizeHandle";
import { InsightsToggle } from "./supporting/InsightsToggle";

const SYNTHETIC_CARD_ID = -1;
const MIN_HEIGHT_PX = 400;
const MAX_HEIGHT_PX = 880;

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
  const paperRef = useRef<HTMLDivElement>(null);
  // Undefined until the bottom edge is dragged.
  const [height, setHeight] = useState<number>();
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
    <Paper
      ref={paperRef}
      withBorder
      radius="md"
      p="lg"
      miw={0}
      mih={MIN_HEIGHT_PX}
      mah={MAX_HEIGHT_PX}
      // Until it's resized, the chart fills the column's height.
      flex={height === undefined ? 1 : "none"}
      h={height}
      className={S.root}
    >
      <Stack h="100%">
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>{title}</Title>
          <InsightsToggle />
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
      <ResizeHandle
        className={S.handle}
        axis="y"
        getSize={() => paperRef.current?.offsetHeight ?? MIN_HEIGHT_PX}
        min={MIN_HEIGHT_PX}
        max={MAX_HEIGHT_PX}
        onResize={setHeight}
      />
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
