import cx from "classnames";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

  const stripRef = useRef<HTMLDivElement>(null);
  const itemCount = 1 + (charts?.length ?? 0);
  const { pageCount, activePage, scrollToPage, handleScroll } = useStripPages(
    stripRef,
    itemCount,
  );

  return (
    <div className={S.gallery} data-testid="xray-gallery">
      <div ref={stripRef} className={S.galleryStrip} onScroll={handleScroll}>
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
            <div className={S.galleryItem}>
              <Skeleton className={cx(S.card, S.galleryCard)} />
              <Skeleton h="1rem" w="60%" />
            </div>
          </Repeat>
        )}
      </div>
      {pageCount > 1 && (
        <GalleryStepper
          count={pageCount}
          active={activePage}
          onStepClick={scrollToPage}
        />
      )}
    </div>
  );
}

type StripPages = {
  pageCount: number;
  activePage: number;
  scrollToPage: (page: number) => void;
  handleScroll: () => void;
};

/** Splits a horizontally scrolling strip into viewport-wide pages and tracks the one in view. */
function useStripPages(
  stripRef: RefObject<HTMLDivElement>,
  itemCount: number,
): StripPages {
  const [pages, setPages] = useState({ pageCount: 1, activePage: 0 });

  const handleScroll = useCallback(() => {
    const strip = stripRef.current;
    if (strip == null || strip.clientWidth === 0) {
      return;
    }
    const { scrollLeft, clientWidth } = strip;
    const pageCount = getPageCount(strip);
    const isAtEnd = scrollLeft >= getMaxScrollLeft(strip) - 1;
    const activePage = isAtEnd
      ? pageCount - 1
      : Math.min(pageCount - 1, Math.round(scrollLeft / clientWidth));
    setPages((current) =>
      current.pageCount === pageCount && current.activePage === activePage
        ? current
        : { pageCount, activePage },
    );
  }, [stripRef]);

  useEffect(() => {
    const strip = stripRef.current;
    if (strip == null) {
      return;
    }
    handleScroll();
    const observer = new ResizeObserver(handleScroll);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [stripRef, handleScroll, itemCount]);

  const scrollToPage = (page: number) => {
    const strip = stripRef.current;
    if (strip == null) {
      return;
    }
    // the last page ends flush with the strip's end rather than a full page further
    const isLastPage = page === getPageCount(strip) - 1;
    strip.scrollTo({
      left: isLastPage ? getMaxScrollLeft(strip) : page * strip.clientWidth,
    });
  };

  return { ...pages, scrollToPage, handleScroll };
}

function getMaxScrollLeft(strip: HTMLElement) {
  return strip.scrollWidth - strip.clientWidth;
}

/**
 * One page per viewport width of overflow. A remainder under a quarter of a page is folded
 * into the previous page, so the last dot never moves the strip by a sliver.
 */
function getPageCount(strip: HTMLElement) {
  const overflowPages = getMaxScrollLeft(strip) / strip.clientWidth;
  return Math.max(1, Math.ceil(overflowPages - 0.25) + 1);
}

type GalleryStepperProps = {
  count: number;
  active: number;
  onStepClick: (index: number) => void;
};

function GalleryStepper({ count, active, onStepClick }: GalleryStepperProps) {
  return (
    <div className={S.stepper} role="tablist" aria-label={t`Gallery pages`}>
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-selected={index === active}
          aria-label={t`Page ${index + 1}`}
          tabIndex={index === active ? 0 : -1}
          className={cx(S.step, { [S.stepActive]: index === active })}
          onClick={() => onStepClick(index)}
        />
      ))}
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
      className={S.galleryItem}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div
        className={cx(S.card, S.galleryCard, {
          [S.galleryCardSelected]: isSelected,
        })}
      >
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
      <Text
        className={S.galleryTitle}
        fw="bold"
        size="sm"
        c={isSelected ? "brand" : "text-primary"}
        truncate="end"
      >
        {title}
      </Text>
    </div>
  );
}
