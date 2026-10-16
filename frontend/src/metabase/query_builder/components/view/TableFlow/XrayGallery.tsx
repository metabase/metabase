import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery, useGetXrayDashboardQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Box, Repeat, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  ConcreteTableId,
  DashCardId,
  RawSeries,
} from "metabase-types/api";

import S from "./TableFlow.module.css";
import { type XrayChart, getXrayCharts } from "./utils";

type XrayChartSeries = {
  rawSeries: RawSeries | null;
  error: string | null;
};

/**
 * Runs an x-ray chart's query. `rawSeries` is `null` while loading or on error.
 */
export function useXrayChartSeries({ card }: XrayChart): XrayChartSeries {
  const { data, error } = useGetAdhocQueryQuery({
    ...card.dataset_query,
    ignore_error: true,
  });

  if (error) {
    return { rawSeries: null, error: getErrorMessage(error) };
  }
  if (data?.error) {
    return {
      rawSeries: null,
      error: typeof data.error === "string" ? data.error : t`Query failed`,
    };
  }
  return {
    rawSeries: data?.data ? [{ card, data: data.data }] : null,
    error: null,
  };
}

type XrayGalleryProps = {
  tableId: ConcreteTableId;
  /** The question's results, shown as the leading raw records card. */
  rawSeries: RawSeries | null;
  /** `null` selects the raw records card. */
  selectedChartId: DashCardId | null;
  onSelectChart: (chart: XrayChart | null) => void;
};

export function XrayGallery({
  tableId,
  rawSeries,
  selectedChartId,
  onSelectChart,
}: XrayGalleryProps) {
  const { data: dashboard, error } = useGetXrayDashboardQuery({
    subPath: `table/${tableId}`,
  });
  const charts = useMemo(() => getXrayCharts(dashboard), [dashboard]);
  const rawRecordsSeries = useMemo<RawSeries | null>(
    () =>
      rawSeries?.map(({ card, data }) => ({
        card: { ...card, display: "table" },
        data,
      })) ?? null,
    [rawSeries],
  );

  return (
    <div className={S.galleryStrip} data-testid="xray-gallery">
      <GalleryThumbnail
        title={t`Raw records`}
        rawSeries={rawRecordsSeries}
        error={null}
        isSelected={selectedChartId == null}
        onSelect={() => onSelectChart(null)}
      />
      {error ? (
        <Text c="text-secondary">{t`Couldn't load x-rays for this table.`}</Text>
      ) : dashboard ? (
        charts.map((chart) => (
          <XrayThumbnail
            key={chart.id}
            chart={chart}
            isSelected={chart.id === selectedChartId}
            onSelect={() => onSelectChart(chart)}
          />
        ))
      ) : (
        <Repeat times={6}>
          <Skeleton className={cx(S.card, S.galleryCard)} />
        </Repeat>
      )}
    </div>
  );
}

type XrayThumbnailProps = {
  chart: XrayChart;
  isSelected: boolean;
  onSelect: () => void;
};

function XrayThumbnail({ chart, isSelected, onSelect }: XrayThumbnailProps) {
  const { rawSeries, error } = useXrayChartSeries(chart);

  return (
    <GalleryThumbnail
      title={chart.card.name}
      rawSeries={rawSeries}
      error={error}
      isSelected={isSelected}
      onSelect={onSelect}
    />
  );
}

type GalleryThumbnailProps = {
  title: string;
  rawSeries: RawSeries | null;
  error: string | null;
  isSelected: boolean;
  onSelect: () => void;
};

function GalleryThumbnail({
  title,
  rawSeries,
  error,
  isSelected,
  onSelect,
}: GalleryThumbnailProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={cx(S.card, S.galleryCard, {
        [S.galleryCardSelected]: isSelected,
      })}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <Text fw="bold" size="sm" truncate="end">
        {title}
      </Text>
      <Box className={S.chartArea}>
        {rawSeries ? (
          <Visualization
            className={S.thumbnailChart}
            rawSeries={rawSeries}
            isDashboard
            isQueryBuilder={false}
            showTitle={false}
            hideLegend
          />
        ) : error ? (
          <Text size="sm" c="text-secondary">
            {error}
          </Text>
        ) : (
          <Skeleton h="100%" />
        )}
      </Box>
    </div>
  );
}
