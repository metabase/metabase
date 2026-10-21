import { t } from "ttag";
import { noop } from "underscore";

import { Alert, Box, Loader, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
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

import S from "./AnalysisResult.module.css";

const SYNTHETIC_CARD_ID = -1;

type AnalysisResultProps = {
  title: string;
  display: CardDisplayType;
  vizSettings: VisualizationSettings;
  dataset: Dataset | undefined;
  datasetQuery: DatasetQuery | undefined;
  isLoading: boolean;
  error: string | undefined;
  /** Settings still to fill in. When non-empty, a skeleton of the chart replaces the result. */
  missing: MissingSetting[];
  mode?: ClickActionsMode;
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
  const { display, isLoading, error, mode } = props;
  const { rawSeries, isIncomplete, isShowingVisualization } =
    getResultState(props);

  return (
    <Stack gap="sm" flex={1} mih={0} h="100%">
      {isIncomplete && (
        <Stack
          className={S.skeleton}
          flex={1}
          mih={0}
          p="md"
          aria-label={t`Chart preview`}
        >
          {getChartSkeletonImage(display)}
        </Stack>
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
            onChangeCardAndRun={noop}
          />
        </Box>
      )}
    </Stack>
  );
};
