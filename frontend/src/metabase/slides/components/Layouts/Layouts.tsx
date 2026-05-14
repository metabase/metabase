import cx from "classnames";
import type { FC } from "react";

import { Box } from "metabase/ui";

import type {
  BigQuoteData,
  BulletsData,
  ChartHeroData,
  ClosingData,
  CoverData,
  MetricCell,
  MetricsGridData,
  Slide,
  TitleMetricsWithChartData,
  TwoColumnData,
} from "../../types";
import { SlideChart } from "../SlideChart/SlideChart";

import S from "./Layouts.module.css";

/* ──────────────────────────────────────────────────────────────────────────
   Building blocks
   ────────────────────────────────────────────────────────────────────────── */

const accentClass = (accent?: CoverData["accent"]) => {
  switch (accent) {
    case "sunset":
      return S.accentSunset;
    case "ocean":
      return S.accentOcean;
    case "forest":
      return S.accentForest;
    case "violet":
    default:
      return S.accentViolet;
  }
};

const MetricCard: FC<{ metric: MetricCell }> = ({ metric }) => {
  const hasChart = metric.card_id != null && metric.card_id > 0;
  return (
    <Box className={cx(S.metricCard, { [S.withChart]: hasChart })}>
      {hasChart ? (
        <>
          <Box className={S.metricCardChart}>
            <SlideChart cardId={metric.card_id} display="scalar" />
          </Box>
          <div className={S.metricCardLabel}>{metric.label}</div>
          {metric.subtext && (
            <div className={S.metricCardSubtext}>{metric.subtext}</div>
          )}
        </>
      ) : (
        <>
          <div className={S.metricCardValue}>{metric.value}</div>
          <div className={S.metricCardLabel}>{metric.label}</div>
          {metric.subtext && (
            <div className={S.metricCardSubtext}>{metric.subtext}</div>
          )}
        </>
      )}
    </Box>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   Per-layout components
   ────────────────────────────────────────────────────────────────────────── */

export const CoverSlide: FC<{ data: CoverData }> = ({ data }) => (
  <Box className={cx(S.canvas, S.cover, accentClass(data.accent))}>
    <h1 className={S.title}>{data.title || "Untitled"}</h1>
    {data.subtitle && <p className={S.subtitle}>{data.subtitle}</p>}
  </Box>
);

export const ClosingSlide: FC<{ data: ClosingData }> = ({ data }) => (
  <Box className={cx(S.canvas, S.closing)}>
    <h1 className={S.title}>{data.title || "Thank you"}</h1>
    {data.subtitle && <p className={S.subtitle}>{data.subtitle}</p>}
  </Box>
);

export const BulletsSlide: FC<{ data: BulletsData }> = ({ data }) => (
  <Box className={cx(S.canvas, S.bullets)}>
    {data.eyebrow && <div className={S.eyebrow}>{data.eyebrow}</div>}
    <h2 className={S.title}>{data.title || "Untitled"}</h2>
    <ul className={S.bulletsList}>
      {data.bullets.map((b, i) => (
        <li className={S.bulletsItem} key={i}>
          <span className={S.bulletsBullet} aria-hidden />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  </Box>
);

export const BigQuoteSlide: FC<{ data: BigQuoteData }> = ({ data }) => (
  <Box className={cx(S.canvas, S.bigQuote)}>
    <div className={S.bigQuoteMark}>“</div>
    <p className={S.bigQuoteText}>{data.quote}</p>
    {data.attribution && (
      <div className={S.bigQuoteAttribution}>— {data.attribution}</div>
    )}
  </Box>
);

export const ChartHeroSlide: FC<{ data: ChartHeroData }> = ({ data }) => (
  <Box className={cx(S.canvas, S.chartHero)}>
    <h2 className={S.title}>{data.title}</h2>
    <Box className={S.chartHeroChart}>
      <SlideChart cardId={data.card_id} />
    </Box>
    {data.caption && <p className={S.caption}>{data.caption}</p>}
  </Box>
);

export const MetricsGridSlide: FC<{ data: MetricsGridData }> = ({ data }) => (
  <Box className={cx(S.canvas, S.metricsGrid)}>
    <h2 className={S.title}>{data.title}</h2>
    <Box className={S.metricsGridList} data-count={String(data.metrics.length)}>
      {data.metrics.map((m, i) => (
        <MetricCard metric={m} key={i} />
      ))}
    </Box>
  </Box>
);

export const TitleMetricsWithChartSlide: FC<{
  data: TitleMetricsWithChartData;
}> = ({ data }) => (
  <Box className={cx(S.canvas, S.titleMetricsChart)}>
    <h2 className={S.title}>{data.title}</h2>
    {data.description && <p className={S.subtitle}>{data.description}</p>}
    <Box className={S.titleMetricsChartBody}>
      <Box className={S.titleMetricsChartLeft}>
        <SlideChart cardId={data.card_id} />
      </Box>
      <Box className={S.titleMetricsChartRight}>
        {data.metrics.map((m, i) => (
          <Box className={S.sidebarMetric} key={i}>
            <div className={S.sidebarMetricValue}>{m.value}</div>
            <div className={S.sidebarMetricLabel}>{m.label}</div>
          </Box>
        ))}
      </Box>
    </Box>
  </Box>
);

export const TwoColumnSlide: FC<{ data: TwoColumnData }> = ({ data }) => (
  <Box className={cx(S.canvas, S.twoColumn)}>
    <h2 className={S.title}>{data.title}</h2>
    <Box className={S.twoColumnBody}>
      <Box className={S.twoColumnLeft}>
        <ul className={S.twoColumnBullets}>
          {data.bullets.map((b, i) => (
            <li className={S.twoColumnItem} key={i}>
              <span className={S.twoColumnBullet} aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Box>
      <Box className={S.twoColumnRight}>
        <SlideChart cardId={data.card_id} />
      </Box>
    </Box>
  </Box>
);

/* ──────────────────────────────────────────────────────────────────────────
   Dispatch
   ────────────────────────────────────────────────────────────────────────── */

export const SlideContent: FC<{ slide: Slide }> = ({ slide }) => {
  switch (slide.layout) {
    case "cover":
      return <CoverSlide data={slide.data} />;
    case "closing":
      return <ClosingSlide data={slide.data} />;
    case "bullets":
      return <BulletsSlide data={slide.data} />;
    case "big_quote":
      return <BigQuoteSlide data={slide.data} />;
    case "chart_hero":
      return <ChartHeroSlide data={slide.data} />;
    case "metrics_grid":
      return <MetricsGridSlide data={slide.data} />;
    case "title_metrics_with_chart":
      return <TitleMetricsWithChartSlide data={slide.data} />;
    case "two_column":
      return <TwoColumnSlide data={slide.data} />;
    default: {
      const _exhaustive: never = slide;
      return (
        <Box className={cx(S.canvas, S.fallback)}>
          {`Unknown layout: ${String((_exhaustive as { layout: string }).layout)}`}
        </Box>
      );
    }
  }
};
