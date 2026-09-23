import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import { UMAP } from "umap-js";
import _ from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useNavigate } from "metabase/router";
import {
  ActionIcon,
  Box,
  Center,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import type { EChartsEventHandler } from "metabase/viz-core";
import { useGetEmbeddingProjectionQuery } from "metabase-enterprise/api";
import type { EmbeddingProjectionPoint } from "metabase-types/api";

import { registerLegendComponent } from "./echarts-legend";

registerLegendComponent();

const RANDOM_SEED = 42;
const MAX_NEIGHBORS = 15;
const MIN_POINTS_FOR_UMAP = 4;

type ProjectedPoint = EmbeddingProjectionPoint & {
  x: number;
  y: number;
};

type ScatterDatum = {
  value: [number, number];
  name: string;
  model: string;
  modelId: string;
};

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 1 : 1 - dot / denominator;
}

function getEntityUrl(model: string, modelId: string): string | null {
  switch (model) {
    case "card":
    case "question":
      return `/question/${modelId}`;
    case "dataset":
    case "model":
      return `/model/${modelId}`;
    case "metric":
      return `/metric/${modelId}`;
    case "dashboard":
      return `/dashboard/${modelId}`;
    case "table":
      return Urls.dataStudioTable(Number(modelId));
    case "collection":
      return `/collection/${modelId}`;
    case "database":
      return `/browse/databases/${modelId}`;
    case "document":
      return `/document/${modelId}`;
    default:
      return null;
  }
}

function useProjection(points: EmbeddingProjectionPoint[] | undefined) {
  const [projection, setProjection] = useState<ProjectedPoint[] | null>(null);
  const [projectionError, setProjectionError] = useState<string | null>(null);

  useEffect(() => {
    setProjection(null);
    setProjectionError(null);

    if (points == null || points.length === 0) {
      return;
    }

    if (points.length < MIN_POINTS_FOR_UMAP) {
      setProjection(points.map((point, i) => ({ ...point, x: i, y: 0 })));
      return;
    }

    let cancelled = false;

    const umap = new UMAP({
      nComponents: 2,
      nNeighbors: Math.min(MAX_NEIGHBORS, points.length - 1),
      minDist: 0.1,
      distanceFn: cosineDistance,
      random: mulberry32(RANDOM_SEED),
    });

    umap
      .fitAsync(
        points.map((point) => point.embedding),
        () => !cancelled,
      )
      .then((coordinates) => {
        if (cancelled) {
          return;
        }
        setProjection(
          points.map((point, i) => ({
            ...point,
            x: coordinates[i][0],
            y: coordinates[i][1],
          })),
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setProjectionError(
            error instanceof Error ? error.message : String(error),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [points]);

  return { projection, projectionError };
}

function getChartOption(projection: ProjectedPoint[]): EChartsCoreOption {
  const pointsByModel = _.groupBy(projection, (point) => point.model);
  const models = Object.keys(pointsByModel).sort();

  return {
    animation: false,
    legend: { top: 0, type: "scroll" },
    grid: { left: 16, right: 44, top: 40, bottom: 44 },
    xAxis: { type: "value", show: false, scale: true },
    yAxis: { type: "value", show: false, scale: true },
    tooltip: {
      trigger: "item",
      formatter: (params: { data: ScatterDatum }) =>
        `<b>${_.escape(params.data.name)}</b><br/>${_.escape(params.data.model)}`,
    },
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none" },
      { type: "inside", yAxisIndex: 0, filterMode: "none" },
      {
        type: "slider",
        xAxisIndex: 0,
        filterMode: "none",
        height: 16,
        bottom: 12,
        showDataShadow: false,
        brushSelect: false,
      },
      {
        type: "slider",
        yAxisIndex: 0,
        filterMode: "none",
        width: 16,
        right: 12,
        showDataShadow: false,
        brushSelect: false,
      },
    ],
    series: models.map((model) => ({
      name: model,
      type: "scatter",
      symbolSize: 7,
      data: pointsByModel[model].map(
        (point): ScatterDatum => ({
          value: [point.x, point.y],
          name: point.name,
          model: point.model,
          modelId: point.model_id,
        }),
      ),
    })),
  };
}

// Indices into the option's dataZoom array. The inside components (0 = x, 1 = y)
// are the dispatch targets; the sliders on the same axes stay in sync automatically.
const INSIDE_ZOOM_INDICES = [0, 1];
const ALL_ZOOM_INDICES = [0, 1, 2, 3];
const ZOOM_STEP = 0.7;

function useZoomControls() {
  const chartRef = useRef<EChartsType | null>(null);

  const handleChartInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const chart = chartRef.current;
    if (chart == null) {
      return;
    }
    // getOption() returns ECharts' untyped option bag; narrow to the dataZoom
    // fields we read since echarts provides no typed accessor for it.
    const dataZoom = (
      chart.getOption() as { dataZoom?: { start?: number; end?: number }[] }
    ).dataZoom;
    INSIDE_ZOOM_INDICES.forEach((dataZoomIndex) => {
      const { start = 0, end = 100 } = dataZoom?.[dataZoomIndex] ?? {};
      const center = (start + end) / 2;
      const half = ((end - start) / 2) * factor;
      chart.dispatchAction({
        type: "dataZoom",
        dataZoomIndex,
        start: Math.max(0, center - half),
        end: Math.min(100, center + half),
      });
    });
  }, []);

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);

  const resetZoom = useCallback(() => {
    const chart = chartRef.current;
    if (chart == null) {
      return;
    }
    ALL_ZOOM_INDICES.forEach((dataZoomIndex) => {
      chart.dispatchAction({
        type: "dataZoom",
        dataZoomIndex,
        start: 0,
        end: 100,
      });
    });
  }, []);

  return { handleChartInit, zoomIn, zoomOut, resetZoom };
}

export function EmbeddingMapPage() {
  usePageTitle(t`Embedding map`);
  const navigate = useNavigate();

  const { data, isLoading, error } = useGetEmbeddingProjectionQuery();
  const { projection, projectionError } = useProjection(data?.points);
  const { handleChartInit, zoomIn, zoomOut, resetZoom } = useZoomControls();

  const option = useMemo(
    () => (projection != null ? getChartOption(projection) : null),
    [projection],
  );

  const eventHandlers: EChartsEventHandler[] = useMemo(
    () => [
      {
        eventName: "click",
        handler: (event: { data?: ScatterDatum }) => {
          if (event.data == null) {
            return;
          }
          const url = getEntityUrl(event.data.model, event.data.modelId);
          if (url != null) {
            navigate(url);
          }
        },
      },
    ],
    [navigate],
  );

  const isEmpty = !isLoading && error == null && data?.points.length === 0;
  const isComputing =
    !isLoading &&
    error == null &&
    !isEmpty &&
    projection == null &&
    projectionError == null;

  return (
    <Stack h="100%" p="lg" gap="md">
      <Title order={2}>{t`Embedding map`}</Title>
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ?? projectionError}
        style={{ flex: 1, minHeight: 0 }}
      >
        {isEmpty ? (
          <Center h="100%">
            <Text c="text-secondary">
              {t`No embeddings found. Semantic search may not be configured, or the index is empty.`}
            </Text>
          </Center>
        ) : isComputing ? (
          <Center h="100%">
            <Stack align="center" gap="sm">
              <Loader />
              <Text c="text-secondary">{t`Computing projection…`}</Text>
            </Stack>
          </Center>
        ) : option != null ? (
          <Box w="100%" h="100%" pos="relative">
            <ResponsiveEChartsRenderer
              option={option}
              eventHandlers={eventHandlers}
              onInit={handleChartInit}
            />
            <Stack pos="absolute" top={48} left={12} gap="xs">
              <Tooltip label={t`Zoom in`} position="right">
                <ActionIcon
                  variant="default"
                  aria-label={t`Zoom in`}
                  onClick={zoomIn}
                >
                  <Icon name="zoom_in" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t`Zoom out`} position="right">
                <ActionIcon
                  variant="default"
                  aria-label={t`Zoom out`}
                  onClick={zoomOut}
                >
                  <Icon name="zoom_out" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t`Reset view`} position="right">
                <ActionIcon
                  variant="default"
                  aria-label={t`Reset view`}
                  onClick={resetZoom}
                >
                  <Icon name="revert" />
                </ActionIcon>
              </Tooltip>
            </Stack>
          </Box>
        ) : null}
      </LoadingAndErrorWrapper>
    </Stack>
  );
}
