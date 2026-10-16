import { t } from "ttag";
import { noop } from "underscore";

import { Alert, Box, Button, Loader, Stack, Text, Title } from "metabase/ui";
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
  mode?: ClickActionsMode;
  onUpdateWarnings: (warnings: string[]) => void;
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
  AnalysisResultProps,
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

/** The analysis result: setup, an error, loading, or the chart. */
export const AnalysisResult = (props: AnalysisResultProps) => {
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
