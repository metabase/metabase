import { type ReactNode, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ErrorMessage } from "metabase/common/components/ErrorMessage";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ChartTypePicker } from "metabase/metrics-viewer/components/MetricControls/LeftControls/ChartTypePicker";
import { getDimensionBreakoutConfig } from "metabase/metrics-viewer/utils/dimension-breakout-config";
import {
  Box,
  Center,
  Flex,
  Group,
  Icon,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";

import { trackMetricCubeViewerDisplayChanged } from "../../analytics";
import { useMetricCubeViewerContext } from "../../context";
import { useCubeCardSeries } from "../../hooks/use-cube-card-series";
import type { CubeCard as CubeCardModel } from "../../types";
import { getCardTitle } from "../../utils/card-titles";
import {
  type CardViewerModel,
  cardToViewerModel,
} from "../../utils/card-viewer-model";

import S from "./CubeCard.module.css";

export type CubeCardVariant = "chart" | "overview";

export interface CubeCardProps {
  card: CubeCardModel;
  /** Overview cards are compact number tiles. */
  variant?: CubeCardVariant;
  /** Card actions menu; rendered at the end of the card header. */
  actions?: ReactNode;
}

export function CubeCard({ card, variant = "chart", actions }: CubeCardProps) {
  const {
    catalog,
    definitions,
    state,
    actions: viewerActions,
  } = useMetricCubeViewerContext();

  const model = useMemo(
    () =>
      cardToViewerModel({
        card,
        catalog,
        definitions,
        filters: state.filters,
      }),
    [card, catalog, definitions, state.filters],
  );

  const title = getCardTitle(card, catalog);
  const chartTypes = getDimensionBreakoutConfig(
    model?.dimensionBreakout.type ?? "scalar",
  ).availableDisplayTypes;
  const showChartTypePicker = chartTypes.length > 1;

  const unappliedFilterMeasureNames = (model?.unappliedFilterMeasureIds ?? [])
    .flatMap((measureId) => {
      const measure = catalog.measures.find((m) => m.id === measureId);
      return measure ? [measure.name] : [];
    })
    .join(", ");

  return (
    <Paper
      withBorder
      shadow="none"
      className={variant === "overview" ? S.overviewCard : S.card}
      data-testid="cube-card"
    >
      <Stack h="100%" gap={0}>
        <Group
          gap="sm"
          px="lg"
          pt="sm"
          wrap="nowrap"
          justify="space-between"
          align="center"
        >
          <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
            <Text fw="bold" size="md" truncate="end">
              {title}
            </Text>
            {unappliedFilterMeasureNames && (
              <Tooltip
                label={t`Some filters don't apply to ${unappliedFilterMeasureNames}`}
              >
                <Icon
                  name="info"
                  c="text-secondary"
                  aria-label={t`Some filters don't apply to ${unappliedFilterMeasureNames}`}
                />
              </Tooltip>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap" flex="0 0 auto">
            {showChartTypePicker && (
              <ChartTypePicker
                chartTypes={chartTypes}
                value={card.display}
                onChange={(display) => {
                  viewerActions.setCardDisplay(card.id, display);
                  trackMetricCubeViewerDisplayChanged(display);
                }}
              />
            )}
            {actions}
          </Group>
        </Group>
        <Box className={S.chartArea}>
          {model ? (
            <CubeCardChart card={card} model={model} />
          ) : (
            <Center h="100%">
              <LoadingAndErrorWrapper
                error={t`This card refers to a measure that isn't available.`}
              />
            </Center>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

interface CubeCardChartProps {
  card: CubeCardModel;
  model: CardViewerModel;
}

function CubeCardChart({ card, model }: CubeCardChartProps) {
  const { series, queriesAreLoading, queriesError } = useCubeCardSeries(
    model,
    card.display,
  );

  if (queriesError) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={queriesError} />
      </Center>
    );
  }

  if (queriesAreLoading || series.length === 0) {
    return <ChartSkeleton display={card.display} className={S.visualization} />;
  }

  const hasNoResults = series.every((singleSeries) =>
    datasetContainsNoResults(singleSeries.data),
  );
  if (hasNoResults) {
    return (
      <Center h="100%">
        <ErrorMessage
          type="noRows"
          title={t`No results`}
          message={t`This may be the answer you're looking for. If not, try removing or changing your filters to make them less specific.`}
          action={null}
        />
      </Center>
    );
  }

  const hideLegend =
    model.formulaEntities.length === 1 && card.dimensionKeys.length < 2;

  return (
    <Flex h="100%" direction="column">
      <Visualization
        className={S.visualization}
        rawSeries={series}
        isQueryBuilder={false}
        hideLegend={hideLegend}
        onChangeCardAndRun={_.noop}
        isMetricsViewer
      />
    </Flex>
  );
}
