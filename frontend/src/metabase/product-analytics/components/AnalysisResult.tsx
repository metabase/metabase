import { useState } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import { Warnings } from "metabase/common/components/Warnings";
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
import { PRODUCT_ANALYTICS_CLICK_ACTIONS_MODE } from "../click-actions-mode";

const SYNTHETIC_CARD_ID = -1;

type AnalysisResultBodyProps = {
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
  mode?: ClickActionsMode;
  onUpdateWarnings: (warnings: string[]) => void;
};

type AnalysisResultProps = Omit<
  AnalysisResultBodyProps,
  "mode" | "onUpdateWarnings"
> & {
  warnings: string[];
};

type ResultState = {
  rawSeries: RawSeries | null;
  isIncomplete: boolean;
  isShowingVisualization: boolean;
};

/** Which of the result's states to show: setup, an error, loading, or the chart. */
export const getResultState = ({
  title,
  display,
  vizSettings,
  dataset,
  datasetQuery,
  isLoading,
  error,
  missing,
}: Pick<
  AnalysisResultBodyProps,
  | "title"
  | "display"
  | "vizSettings"
  | "dataset"
  | "datasetQuery"
  | "isLoading"
  | "error"
  | "missing"
>): ResultState => {
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
  return {
    rawSeries,
    isIncomplete,
    isShowingVisualization:
      !isIncomplete && !isLoading && !error && rawSeries !== null,
  };
};

export const AnalysisResult = ({ warnings, ...props }: AnalysisResultProps) => {
  const [vizWarnings, setVizWarnings] = useState<string[]>([]);
  const { isShowingVisualization } = getResultState(props);
  const allWarnings = isShowingVisualization
    ? [...warnings, ...vizWarnings]
    : warnings;

  return (
    <Paper withBorder p="lg" style={{ flex: 1, minWidth: 0 }}>
      <Stack h="100%">
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>{props.title}</Title>
          <Warnings warnings={allWarnings} size={18} />
        </Group>
        <AnalysisResultBody
          {...props}
          mode={PRODUCT_ANALYTICS_CLICK_ACTIONS_MODE}
          onUpdateWarnings={setVizWarnings}
        />
      </Stack>
    </Paper>
  );
};

/** The result without its frame or title: setup, an error, loading, or the chart. */
export const AnalysisResultBody = (props: AnalysisResultBodyProps) => {
  const { missing, setupLabel, onOpenSetup, isLoading, error, mode } = props;
  const { rawSeries, isIncomplete, isShowingVisualization } =
    getResultState(props);

  return (
    <Stack gap="sm" flex={1} mih={0} h="100%">
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
      {isShowingVisualization && rawSeries !== null && (
        <Box flex={1} mih={0}>
          <Visualization
            rawSeries={rawSeries}
            isQueryBuilder={false}
            mode={mode}
            onUpdateWarnings={props.onUpdateWarnings}
            onChangeCardAndRun={noop}
          />
        </Box>
      )}
    </Stack>
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
