import { useMemo } from "react";
import { noop } from "underscore";

import { useGetMetricDatasetQuery } from "metabase/api";
import type { MetricVizValue } from "metabase/api/ai-streaming/schemas";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Center, Flex, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import {
  getDatasetError,
  getGenericErrorMessage,
} from "metabase/visualizations/lib/errors";
import type { Card } from "metabase-types/api";

import S from "./MetabotInlineChart.module.css";

/**
 * Renders a Metabot metric-math result inline: it posts the validated definition to
 * /api/metric/dataset (the same engine the metrics viewer uses) and draws the computed
 * cols/rows. The definition carries no runnable card query, so it renders a synthetic,
 * read-only card rather than linking out to a question.
 */
export function MetabotMetricViz({ value }: { value: MetricVizValue }) {
  const { definition, display, title } = value;

  const { data: dataset, error } = useGetMetricDatasetQuery({ definition });

  const card: Card = useMemo(
    () =>
      ({
        name: title,
        display: display ?? "line",
        visualization_settings: {},
      }) as Card,
    [title, display],
  );

  const rawSeries = useMemo(
    () => (dataset ? [{ card, data: dataset.data }] : null),
    [card, dataset],
  );

  const datasetError = dataset ? getDatasetError(dataset) : undefined;
  const requestError = error
    ? { message: getGenericErrorMessage(), icon: "warning" as const }
    : undefined;
  const chartError = datasetError ?? requestError;

  return (
    <Box className={S.container} data-testid="metabot-metric-viz">
      <Flex className={S.header} align="center" gap="sm">
        <Text className={S.title} fw="bold" truncate>
          {title}
        </Text>
      </Flex>
      <Box className={S.viz}>
        {chartError ? (
          <Center h="100%" p="md">
            <ErrorView error={chartError.message} icon={chartError.icon} />
          </Center>
        ) : !rawSeries ? (
          <LoadingAndErrorWrapper loading />
        ) : (
          <Visualization
            rawSeries={rawSeries}
            isQueryBuilder={false}
            onChangeCardAndRun={noop}
          />
        )}
      </Box>
    </Box>
  );
}
