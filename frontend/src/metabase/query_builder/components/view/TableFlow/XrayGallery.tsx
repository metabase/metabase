import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetXrayDashboardQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Box, Repeat, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { Card, ConcreteTableId, RawSeries } from "metabase-types/api";

import S from "./TableFlow.module.css";
import { type XrayChart, getXrayCharts } from "./utils";

type CardSeries = {
  rawSeries: RawSeries | null;
  error: string | null;
};

/**
 * Runs a card's ad-hoc query. `rawSeries` is `null` while loading (including reruns after the
 * card changes, so a new display never pairs with stale columns) or on error.
 */
export function useCardSeries(card: Card): CardSeries {
  const { currentData: data, error } = useGetAdhocQueryQuery({
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

type XrayCharts = {
  /** `null` while loading, when skipped, or on error. */
  charts: XrayChart[] | null;
  hasError: boolean;
};

/** The x-ray charts of `tableId`, fetched only while `isEnabled`. */
export function useXrayCharts(
  tableId: ConcreteTableId | null,
  isEnabled: boolean,
): XrayCharts {
  const { data: dashboard, isError } = useGetXrayDashboardQuery(
    tableId != null && isEnabled ? { subPath: `table/${tableId}` } : skipToken,
  );
  const charts = useMemo(
    () => (dashboard ? getXrayCharts(dashboard) : null),
    [dashboard],
  );
  return { charts, hasError: isError };
}

type XrayGalleryProps = XrayCharts & {
  /** The question's results, shown as the leading raw records card. */
  rawSeries: RawSeries | null;
  /** 1-based position of the selected chart; `null` selects the raw records card. */
  selectedPosition: number | null;
  onSelectPosition: (position: number | null) => void;
};

export function XrayGallery({
  charts,
  hasError,
  rawSeries,
  selectedPosition,
  onSelectPosition,
}: XrayGalleryProps) {
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
        isSelected={selectedPosition == null}
        onSelect={() => onSelectPosition(null)}
      />
      {hasError ? (
        <Text c="text-secondary">{t`Couldn't load x-rays for this table.`}</Text>
      ) : charts ? (
        charts.map((chart, index) => (
          <XrayThumbnail
            key={chart.id}
            chart={chart}
            isSelected={index + 1 === selectedPosition}
            onSelect={() => onSelectPosition(index + 1)}
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
  const { rawSeries, error } = useCardSeries(chart.card);

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
