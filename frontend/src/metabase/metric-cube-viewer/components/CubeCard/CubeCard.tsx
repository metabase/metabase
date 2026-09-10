import { type ReactNode, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ErrorMessage } from "metabase/common/components/ErrorMessage";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { MetricsViewerDisplayType } from "metabase/common/metrics-viewer";
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
import {
  type UseCubeCardSeriesResult,
  useCubeCardSeries,
} from "../../hooks/use-cube-card-series";
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
  const isDisplayOverridden =
    card.kind === "custom" || state.displayOverrides[card.id] != null;

  const unappliedFilterMeasureNames = (model?.unappliedFilterMeasureIds ?? [])
    .flatMap((measureId) => {
      const measure = catalog.measures.find((m) => m.id === measureId);
      return measure ? [measure.name] : [];
    })
    .join(", ");

  const handleDisplayChange = (display: MetricsViewerDisplayType) => {
    viewerActions.setCardDisplay(card.id, display);
    trackMetricCubeViewerDisplayChanged(display);
  };

  if (!model) {
    return (
      <CubeCardFrame
        variant={variant}
        title={title}
        unappliedFilterMeasureNames={unappliedFilterMeasureNames}
        actions={actions}
      >
        <Center h="100%">
          <LoadingAndErrorWrapper
            error={t`This card refers to a measure that isn't available.`}
          />
        </Center>
      </CubeCardFrame>
    );
  }

  return (
    <LoadedCubeCard
      card={card}
      model={model}
      variant={variant}
      title={title}
      unappliedFilterMeasureNames={unappliedFilterMeasureNames}
      actions={actions}
      isDisplayOverridden={isDisplayOverridden}
      onDisplayChange={handleDisplayChange}
    />
  );
}

interface CubeCardFrameProps {
  variant: CubeCardVariant;
  title: string;
  unappliedFilterMeasureNames: string;
  picker?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

function CubeCardFrame({
  variant,
  title,
  unappliedFilterMeasureNames,
  picker,
  actions,
  children,
}: CubeCardFrameProps) {
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
            {picker}
            {actions}
          </Group>
        </Group>
        <Box className={S.chartArea}>{children}</Box>
      </Stack>
    </Paper>
  );
}

interface LoadedCubeCardProps {
  card: CubeCardModel;
  model: CardViewerModel;
  variant: CubeCardVariant;
  title: string;
  unappliedFilterMeasureNames: string;
  actions?: ReactNode;
  isDisplayOverridden: boolean;
  onDisplayChange: (display: MetricsViewerDisplayType) => void;
}

function LoadedCubeCard({
  card,
  model,
  variant,
  title,
  unappliedFilterMeasureNames,
  actions,
  isDisplayOverridden,
  onDisplayChange,
}: LoadedCubeCardProps) {
  const seriesResult = useCubeCardSeries(model, card.display, {
    id: card.id,
    title,
    isDisplayOverridden,
  });
  const chartTypes = getDimensionBreakoutConfig(
    model.dimensionBreakout.type,
  ).availableDisplayTypes;
  const pickerValue =
    chartTypes.find((option) => option.type === seriesResult.display)?.type ??
    card.display;
  const picker =
    chartTypes.length > 1 ? (
      <ChartTypePicker
        chartTypes={chartTypes}
        value={pickerValue}
        onChange={onDisplayChange}
      />
    ) : null;

  return (
    <CubeCardFrame
      variant={variant}
      title={title}
      unappliedFilterMeasureNames={unappliedFilterMeasureNames}
      picker={picker}
      actions={actions}
    >
      <CubeCardChart card={card} model={model} seriesResult={seriesResult} />
    </CubeCardFrame>
  );
}

interface CubeCardChartProps {
  card: CubeCardModel;
  model: CardViewerModel;
  seriesResult: UseCubeCardSeriesResult;
}

function CubeCardChart({ card, model, seriesResult }: CubeCardChartProps) {
  const { series, display, queriesAreLoading, queriesError } = seriesResult;

  if (queriesError) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={queriesError} />
      </Center>
    );
  }

  if (queriesAreLoading || series.length === 0) {
    return <ChartSkeleton display={display} className={S.visualization} />;
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
